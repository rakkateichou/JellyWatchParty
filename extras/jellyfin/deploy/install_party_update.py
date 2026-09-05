"""Prepare/apply a Jellyfin plugin pair and session image with hash checks and rollback.

Stage layout: plugins/<name>_<version>/meta.json and replacement assemblies,
plus invite-bootstrap.html. Existing dependency DLLs are retained. Secrets and
server configuration stay on the server. Run prepare before apply.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def health(container, port, path):
    for _ in range(30):
        try:
            data = json.loads(run('docker', 'inspect', container))[0]
            ip = next(iter(data['NetworkSettings']['Networks'].values()))['IPAddress']
            with urllib.request.urlopen(f'http://{ip}:{port}/{path}', timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError(f'{container} did not become healthy')


def prepare(args):
    stage, root = args.stage.resolve(), args.root.resolve()
    prepared = stage / 'prepared'
    prepared.mkdir()
    plan = {'root': str(root), 'plugins': [], 'files': [], 'session_image': args.session_image}
    plugins = root / 'config/plugins'
    for bundle in sorted((stage / 'plugins').iterdir()):
        if not bundle.is_dir():
            continue
        metadata = json.loads((bundle / 'meta.json').read_text())
        prefix = bundle.name.rsplit('_', 1)[0]
        old = [p for p in plugins.glob(prefix + '_*') if p.is_dir()]
        if len(old) != 1:
            raise RuntimeError(f'Expected one installed {prefix} directory, found {len(old)}')
        old = old[0]
        target = plugins / bundle.name
        if target.exists():
            raise RuntimeError(f'Target already exists: {target}')
        after = prepared / bundle.name
        shutil.copytree(old, after)
        for source in bundle.iterdir():
            if source.is_file() and source.name != 'meta.json':
                shutil.copy2(source, after / source.name)
        existing_meta = json.loads((after / 'meta.json').read_text())
        existing_meta.update(version=metadata['version'], status='Active')
        (after / 'meta.json').write_text(json.dumps(existing_meta, indent=2) + '\n')
        for p in [after, *after.rglob('*')]:
            shutil.chown(p, user=old.stat().st_uid, group=old.stat().st_gid)
        plan['plugins'].append({'old': str(old), 'new': str(target), 'prepared': str(after),
            'before': {p.name: digest(p) for p in old.iterdir() if p.is_file()},
            'after': {p.name: digest(p) for p in after.iterdir() if p.is_file()}})
    index_path = root / 'web-overrides/index.html'
    index = index_path.read_text()
    index = re.sub(r'<!-- JellyWatchParty invite bootstrap -->.*?<!-- /JellyWatchParty invite bootstrap -->\s*', '', index, flags=re.S)
    index = re.sub(r'<(style|script)\b[^>]*id=["\x27]jwp-invite-bootstrap(?:-script)?["\x27][^>]*>.*?</\1>\s*', '', index, flags=re.S | re.I)
    index = re.sub(r'<script\b[^>]*JellyWatchParty/ClientScript[^>]*>\s*</script>\s*', '', index, flags=re.I)
    bootstrap = (stage / 'invite-bootstrap.html').read_text()
    index, count = re.subn(r'(<head\b[^>]*>)', lambda match: match[1] + bootstrap + '\n', index, count=1, flags=re.I)
    assert count == 1 and index.count('JellyWatchParty/ClientScript') == 1
    (prepared / 'index.html').write_text(index)
    plan['files'].append({'path': str(index_path), 'prepared': str(prepared / 'index.html'), 'before': digest(index_path), 'after': digest(prepared / 'index.html')})
    if args.session_image:
        run('docker', 'image', 'inspect', args.session_image)
        compose = root / 'docker-compose.yml'
        content, count = re.subn(r'(\n  jwp-session:\s*\n\s+image:) [^\n]+', lambda match: match[1] + ' ' + args.session_image, compose.read_text())
        assert count == 1, 'Expected jwp-session image in compose'
        (prepared / 'docker-compose.yml').write_text(content)
        plan['files'].append({'path': str(compose), 'prepared': str(prepared / 'docker-compose.yml'), 'before': digest(compose), 'after': digest(prepared / 'docker-compose.yml')})
    (stage / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    print(f'Prepared {len(plan["plugins"])} plugin updates with verified backups planned in {stage / "backup"}')


def apply(args):
    stage = args.stage.resolve()
    plan = json.loads((stage / 'plan.json').read_text())
    assert Path(plan['root']) == args.root.resolve()
    for item in plan['plugins']:
        for name, sha in item['before'].items():
            assert digest(Path(item['old']) / name) == sha, 'Installed plugin changed after preparation'
        for name, sha in item['after'].items():
            assert digest(Path(item['prepared']) / name) == sha, 'Prepared plugin changed'
    for item in plan['files']:
        assert digest(Path(item['path'])) == item['before']
        assert digest(Path(item['prepared'])) == item['after']
    backup = stage / 'backup'
    backup.mkdir()
    for item in plan['files']:
        shutil.copy2(item['path'], backup / Path(item['path']).name)
    compose = str(Path(plan['root']) / 'docker-compose.yml')
    run('docker', 'stop', '--time', '20', args.container)
    try:
        for item in plan['plugins']:
            shutil.move(item['old'], backup / Path(item['old']).name)
            shutil.move(item['prepared'], item['new'])
        for item in plan['files']:
            # Preserve the inode of an index file bind-mounted read-only.
            Path(item['path']).write_bytes(Path(item['prepared']).read_bytes())
        if plan['session_image']:
            run('docker', 'compose', '-f', compose, 'up', '-d', '--no-deps', 'jwp-session')
            health('jwp-session', 3000, 'health')
        run('docker', 'start', args.container)
        health(args.container, 8096, 'health')
    except Exception:
        run('docker', 'stop', '--time', '20', args.container)
        for item in reversed(plan['plugins']):
            saved = backup / Path(item['old']).name
            if saved.exists():
                if Path(item['new']).exists():
                    shutil.move(item['new'], stage / ('failed-' + Path(item['new']).name))
                shutil.move(saved, item['old'])
        for item in plan['files']:
            Path(item['path']).write_bytes((backup / Path(item['path']).name).read_bytes())
        if plan['session_image']:
            run('docker', 'compose', '-f', compose, 'up', '-d', '--no-deps', 'jwp-session')
        run('docker', 'start', args.container)
        health(args.container, 8096, 'health')
        raise
    print(f'Installed and healthy. Rollback files: {backup}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'apply'])
    parser.add_argument('stage', type=Path)
    parser.add_argument('--root', type=Path, default=Path('/opt/jellyfin'))
    parser.add_argument('--container', default='jellyfin')
    parser.add_argument('--session-image')
    args = parser.parse_args()
    (prepare if args.mode == 'prepare' else apply)(args)
