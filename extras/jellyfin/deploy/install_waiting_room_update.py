"""Stage and install the tested JellyWatchParty/ShareLinks update with rollback."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path('/opt/jellyfin')
PLUGINS = ROOT / 'config/plugins'
CONFIG = PLUGINS / 'configurations/Jellyfin.Plugin.JavaScriptInjector.xml'
INDEX = ROOT / 'web-overrides/index.html'
UPDATES = (
    ('JellyWatchParty_1.8.1.0', 'JellyWatchParty_1.9.1.0', 'JellyWatchPartyPlugin', '1.9.1.0'),
    ('ShareLinks_1.0.5.0', 'ShareLinks_1.0.7.0', 'Jellyfin.Plugin.ShareLinks', '1.0.7.0'),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def healthy():
    data = json.loads(run('docker', 'inspect', 'jellyfin'))[0]
    ip = next(iter(data['NetworkSettings']['Networks'].values()))['IPAddress']
    return urllib.request.urlopen('http://' + ip + ':8096/health', timeout=3).read() == b'Healthy'


def wait_for_health():
    for _ in range(20):
        try:
            if healthy():
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError('Jellyfin did not become healthy after restart')


def prepare(stage):
    prepared = stage / 'prepared'
    prepared.mkdir()
    plan = {'files': {}, 'plugins': []}
    for old_name, new_name, assembly, version in UPDATES:
        old = PLUGINS / old_name
        assert old.resolve().parent == PLUGINS.resolve() and old.is_dir()
        assert not (PLUGINS / new_name).exists()
        target = prepared / new_name
        target.mkdir()
        # Preserve runtime dependencies; old backup files remain with the backup.
        for source in old.iterdir():
            if source.is_file() and source.suffix in {'.dll', '.json', '.pdb', '.xml'}:
                shutil.copy2(source, target / source.name)
        for source in stage.glob(assembly + '.*'):
            if source.suffix in {'.dll', '.pdb', '.xml', '.json'}:
                shutil.copy2(source, target / source.name)
        metadata = json.loads((target / 'meta.json').read_text())
        metadata.update(version=version, status='Active')
        (target / 'meta.json').write_text(json.dumps(metadata, indent=2) + '\n')
        for file in target.iterdir():
            shutil.chown(file, user=old.stat().st_uid, group=old.stat().st_gid)
        shutil.chown(target, user=old.stat().st_uid, group=old.stat().st_gid)
        plan['plugins'].append({'old': old_name, 'new': new_name,
                                'before': digest(old / (assembly + '.dll')),
                                'after': digest(target / (assembly + '.dll'))})

    live_config = CONFIG.read_text()
    script = (stage / 'random_pick_watching_row.js').read_text()
    pattern = r'(<Name>Random pick in watching row</Name>\s*<Script>).*?(</Script>)'
    assert len(re.findall(pattern, live_config, re.S)) == 1
    patched = re.sub(pattern, lambda match: match[1] + html.escape(script, quote=False) + match[2], live_config, flags=re.S)
    before = ET.fromstring(live_config)
    after = ET.fromstring(patched)
    for a, b in zip(before.findall('.//CustomJavaScriptEntry'), after.findall('.//CustomJavaScriptEntry')):
        if a.findtext('Name') != 'Random pick in watching row':
            assert ET.tostring(a) == ET.tostring(b)
    (prepared / CONFIG.name).write_text(patched)

    index = INDEX.read_text()
    bootstrap = (stage / 'invite-bootstrap.html').read_text().strip()
    if 'id="jwp-invite-bootstrap"' not in index:
        index = index.replace('<head>', '<head>\n' + bootstrap + '\n', 1)
    index = re.sub(r'(/JellyWatchParty/ClientScript)(?:\?[^"\s]*)?', r'\1?v=1.9.1', index)
    index = re.sub(r'(/ShareLinks/ClientScript)(?:\?[^"\s]*)?', r'\1?v=1.0.7', index)
    assert index.count('id="jwp-invite-bootstrap"') == 1
    (prepared / INDEX.name).write_text(index)
    for path in [CONFIG, INDEX]:
        plan['files'][str(path)] = digest(path)
    (stage / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    print(json.dumps({'prepared': str(stage), 'plugin_versions': [update[3] for update in UPDATES]}))


def apply(stage):
    plan = json.loads((stage / 'plan.json').read_text())
    for path, expected in plan['files'].items():
        assert digest(Path(path)) == expected, 'Live configuration changed after preparation'
    for update, plugin in zip(UPDATES, plan['plugins']):
        assert digest(PLUGINS / update[0] / (update[2] + '.dll')) == plugin['before']
    backup = stage / 'backup'
    backup.mkdir()
    for path in [CONFIG, INDEX]:
        shutil.copy2(path, backup / path.name)
    moved = []
    run('docker', 'stop', '--time', '20', 'jellyfin')
    try:
        for old, new, _, _ in UPDATES:
            shutil.move(str(PLUGINS / old), str(backup / old))
            moved.append((old, new))
            shutil.move(str(stage / 'prepared' / new), str(PLUGINS / new))
        for path in [CONFIG, INDEX]:
            # Keep the bind-mounted index inode, ownership and mode intact.
            path.write_bytes((stage / 'prepared' / path.name).read_bytes())
        run('docker', 'start', 'jellyfin')
        wait_for_health()
    except Exception:
        run('docker', 'stop', '--time', '20', 'jellyfin')
        for old, new in reversed(moved):
            if (PLUGINS / new).exists():
                shutil.move(str(PLUGINS / new), str(stage / ('failed-' + new)))
            shutil.move(str(backup / old), str(PLUGINS / old))
        for path in [CONFIG, INDEX]:
            path.write_bytes((backup / path.name).read_bytes())
        run('docker', 'start', 'jellyfin')
        wait_for_health()
        raise
    print(json.dumps({'installed': True, 'healthy': True, 'backup': str(backup)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'apply'])
    parser.add_argument('stage', type=Path)
    args = parser.parse_args()
    stage = args.stage.resolve()
    assert stage.parent == (ROOT / 'updates').resolve() and stage.name.startswith('waiting-room-')
    globals()[args.mode](stage)
