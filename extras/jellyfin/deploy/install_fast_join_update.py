"""Install the bundled early-chat client, preserving a rollback on the server."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

ROOT = Path('/opt/jellyfin')
PLUGINS = ROOT / 'config/plugins'
OLD = PLUGINS / 'JellyWatchParty_1.9.2.0'
NEW = PLUGINS / 'JellyWatchParty_1.9.3.0'
INDEX = ROOT / 'web-overrides/index.html'
ASSEMBLY = 'JellyWatchPartyPlugin.dll'


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def healthy():
    data = json.loads(run('docker', 'inspect', 'jellyfin'))[0]
    ip = next(iter(data['NetworkSettings']['Networks'].values()))['IPAddress']
    for _ in range(20):
        try:
            if urllib.request.urlopen('http://' + ip + ':8096/health', timeout=3).read() == b'Healthy':
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError('Jellyfin did not become healthy')


def prepare(stage):
    assert OLD.is_dir() and not NEW.exists()
    prepared = stage / 'prepared'
    shutil.copytree(OLD, prepared)
    for source in stage.glob('JellyWatchPartyPlugin.*'):
        shutil.copy2(source, prepared / source.name)
    metadata = json.loads((prepared / 'meta.json').read_text())
    metadata.update(version='1.9.3.0', status='Active')
    (prepared / 'meta.json').write_text(json.dumps(metadata, indent=2) + '\n')
    for path in [prepared, *prepared.rglob('*')]:
        shutil.chown(path, user=OLD.stat().st_uid, group=OLD.stat().st_gid)
    index = INDEX.read_text()
    for tag, element_id in [('style', 'jwp-invite-bootstrap'), ('script', 'jwp-invite-bootstrap-script')]:
        index, count = re.subn(r'<' + tag + r'\b[^>]*id="' + element_id + r'"[^>]*>.*?</' + tag + '>', '', index, flags=re.S)
        assert count == 1, 'Expected the previous invitation bootstrap exactly once'
    index, count = re.subn(r'<script\b[^>]*src="[^"]*JellyWatchParty/ClientScript[^"]*"[^>]*>\s*</script>', '', index)
    assert count == 1, 'Expected one previous client script'
    index = index.replace('<head>', '<head>\n' + (stage / 'invite-bootstrap.html').read_text() + '\n', 1)
    assert index.count('JellyWatchParty/ClientScript') == 1
    assert index.index('JellyWatchParty/ClientScript') < index.index('runtime.bundle.js')
    (stage / 'index.after.html').write_text(index)
    plan = {'before_index': digest(INDEX), 'before_plugin': digest(OLD / ASSEMBLY),
            'after_plugin': digest(prepared / ASSEMBLY), 'after_index': digest(stage / 'index.after.html')}
    (stage / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    print('Prepared JellyWatchParty 1.9.3.0 and early chat bootstrap')


def apply(stage):
    plan = json.loads((stage / 'plan.json').read_text())
    assert digest(INDEX) == plan['before_index'] and digest(OLD / ASSEMBLY) == plan['before_plugin']
    assert digest(stage / 'prepared' / ASSEMBLY) == plan['after_plugin']
    assert digest(stage / 'index.after.html') == plan['after_index']
    backup = stage / 'backup'
    backup.mkdir()
    shutil.copy2(INDEX, backup / 'index.html')
    run('docker', 'stop', '--time', '20', 'jellyfin')
    try:
        shutil.move(str(OLD), str(backup / OLD.name))
        shutil.move(str(stage / 'prepared'), str(NEW))
        # Preserve the inode used by the container's read-only bind mount.
        INDEX.write_bytes((stage / 'index.after.html').read_bytes())
        run('docker', 'start', 'jellyfin')
        healthy()
    except Exception:
        run('docker', 'stop', '--time', '20', 'jellyfin')
        if NEW.exists():
            shutil.move(str(NEW), str(stage / 'failed-plugin'))
        if (backup / OLD.name).exists():
            shutil.move(str(backup / OLD.name), str(OLD))
        INDEX.write_bytes((backup / 'index.html').read_bytes())
        run('docker', 'start', 'jellyfin')
        healthy()
        raise
    print('Installed JellyWatchParty 1.9.3.0; Jellyfin is healthy. Backup: ' + str(backup))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'apply'])
    parser.add_argument('stage', type=Path)
    args = parser.parse_args()
    stage = args.stage.resolve()
    assert stage.parent == (ROOT / 'updates').resolve() and stage.name.startswith('fast-join-')
    globals()[args.mode](stage)
