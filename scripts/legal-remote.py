"""Transfer a verified release and invoke its controller over pinned-host SSH."""
import os
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

operation, tag, bundle = sys.argv[1:]
host = os.environ['DEPLOY_HOST']
user = os.environ['DEPLOY_USER']
root = os.environ['DEPLOY_PATH']
port = int(os.environ.get('DEPLOY_PORT') or '22')
if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]*', host) or not re.fullmatch(r'[a-z_][a-z0-9_-]*', user):
    raise ValueError('Expected a hostname/IPv4 and dedicated Unix user')
if not re.fullmatch(r'/[a-zA-Z0-9/_-]+', root) or '..' in Path(root).parts or not 1 <= port <= 65535:
    raise ValueError('Invalid deployment root/port')
if operation not in ['deploy', 'rollback', 'migrate']:
    raise ValueError('Invalid operation')
ssh_options = ['-i', os.environ['DEPLOY_KEY_FILE'], '-o', 'IdentitiesOnly=yes',
               '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=' + os.environ['DEPLOY_KNOWN_HOSTS_FILE'],
               '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15',
               '-o', 'ServerAliveCountMax=4']
target = user + '@' + host
ssh = ['ssh', *ssh_options, '-p', str(port), target]
remote = subprocess.check_output(ssh + ['mktemp -d /tmp/legal-release.XXXXXXXX'], text=True).strip()
if not re.fullmatch(r'/tmp/legal-release\.[a-zA-Z0-9]+', remote):
    raise ValueError('Unexpected temporary directory')
try:
    files = [str(Path(bundle) / name) for name in ['release.json', 'compose.json', 'legal-deploy.py']]
    subprocess.run(['scp', *ssh_options, '-P', str(port), *files, target + ':' + remote + '/'], check=True)
    args = ['python3', remote + '/legal-deploy.py', operation, '--root', root, '--bundle', remote]
    if os.environ.get('ACKNOWLEDGE_SCHEMA') == 'true':
        args.append('--acknowledge-schema')
    if os.environ.get('BACKUP_CONFIRMATION') == 'I_HAVE_A_BACKUP':
        args.append('--backup-confirmed')
    # Apply non-secret authorization settings through the dedicated deploy user.
    # An unset CI variable preserves the existing host configuration.
    settings = []
    mode = os.environ.get('HEMIA_AUTHORIZATION_MODE', '')
    if mode:
        if mode not in ('roles', 'authenticated'):
            raise ValueError('Invalid HEMIA_AUTHORIZATION_MODE')
        settings.append(('HEMIA_AUTHORIZATION_MODE', mode, 'authmode'))
    platform = os.environ.get('LEGAL_PLATFORM_ORGANIZATION_IDS', '')
    if platform:
        ids = [] if platform.strip() == '[]' else [value.strip().lower() for value in platform.split(',') if value.strip()]
        if (not ids and platform.strip() != '[]') or len(set(ids)) != len(ids) or not all(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', value) for value in ids):
            raise ValueError('Invalid LEGAL_PLATFORM_ORGANIZATION_IDS')
        settings.append(('LEGAL_PLATFORM_ORGANIZATION_IDS', ','.join(ids), 'platform-orgs'))
    bindings = os.environ.get('LEGAL_PLATFORM_OPERATOR_BINDINGS', '')
    if bindings:
        # production.env is consumed by Compose with format: raw. Compact JSON
        # stays on one line; SSH arguments are quoted with shlex.join below.
        bindings = json.dumps(json.loads(bindings), separators=(',', ':'), ensure_ascii=True)
        settings.append(('LEGAL_PLATFORM_OPERATOR_BINDINGS', bindings, 'platform-operators'))
    configure_setting = r"""import json,os,re,shutil,sys,tempfile
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlsplit
p=Path(sys.argv[1])/'shared/production.env'
key,value,label=sys.argv[2:5]
if key not in ('HEMIA_AUTHORIZATION_MODE','LEGAL_PLATFORM_ORGANIZATION_IDS','LEGAL_PLATFORM_OPERATOR_BINDINGS') or not re.fullmatch(r'[a-z-]+',label):
    raise ValueError('Invalid setting')
if not p.is_file() or p.stat().st_mode & 0o077:
    raise ValueError('Expected private production.env')
old=p.read_text()
def prior(name):
    values=re.findall(r'^'+name+r'=([^\r\n]*)',old,re.M)
    if len(values)>1: raise ValueError('Duplicate authorization setting')
    return values[0] if values else ''
def org_ids(raw):
    ids=[v.strip().lower() for v in raw.split(',') if v.strip()]
    if len(set(ids))!=len(ids) or not all(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',v) for v in ids):
        raise ValueError('Invalid platform organizations')
    return ids
def operator_bindings(raw,organizations):
    items=json.loads(raw or '[]')
    if not isinstance(items,list) or len(items)>100: raise ValueError('Invalid operator bindings')
    seen=set()
    for item in items:
        if not isinstance(item,dict) or set(item)!=set(('identityIssuer','subjectId','organizationId','applicationIds')):
            raise ValueError('Invalid operator binding fields')
        issuer,subject,org,apps=(item[k] for k in ('identityIssuer','subjectId','organizationId','applicationIds'))
        if not isinstance(issuer,str) or not 1<=len(issuer)<=2048 or re.search(r'[\s\x00-\x1f\x7f-\x9f]',issuer) or not re.match(r'https://',issuer,re.I) or '\\' in issuer:
            raise ValueError('Invalid identity issuer')
        url=urlsplit(issuer)
        if url.scheme!='https' or not url.hostname or '@' in url.netloc or '?' in issuer or '#' in issuer:
            raise ValueError('Invalid identity issuer')
        url.port
        if not isinstance(subject,str) or not 1<=len(subject)<=255 or re.search(r'[\s\x00-\x1f\x7f-\x9f]',subject):
            raise ValueError('Invalid operator subject')
        if not isinstance(org,str) or not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}',org):
            raise ValueError('Invalid operator organization')
        if not isinstance(apps,list) or not 1<=len(apps)<=1000 or not all(isinstance(a,str) and re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}',a) for a in apps):
            raise ValueError('Invalid operator applications')
        normalized=[a.lower() for a in apps]
        if len(set(normalized))!=len(normalized): raise ValueError('Duplicate operator applications')
        identity=(issuer,subject,org.lower())
        if identity in seen: raise ValueError('Duplicate operator binding')
        if org.lower() in organizations: raise ValueError('Operator organization also has broad access')
        seen.add(identity)
        item['organizationId']=org.lower()
        item['applicationIds']=normalized
    return json.dumps(items,separators=(',', ':'),ensure_ascii=True)
if key=='HEMIA_AUTHORIZATION_MODE':
    if value not in ('roles','authenticated'): raise ValueError('Invalid authorization mode')
elif key=='LEGAL_PLATFORM_ORGANIZATION_IDS':
    ids=org_ids(value)
    operator_bindings(prior('LEGAL_PLATFORM_OPERATOR_BINDINGS'),ids)
    value=','.join(ids)
else:
    value=operator_bindings(value,org_ids(prior('LEGAL_PLATFORM_ORGANIZATION_IDS')))
kept=re.sub(r'^'+key+r'=.*\n?', '', old, flags=re.M).rstrip()
new=(kept+'\n' if kept else '')+key+'='+value+'\n'
if old != new:
    backup=p.with_name('production.env.before-'+label+'-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    shutil.copy2(p,backup)
    fd,tmp=tempfile.mkstemp(prefix='.production.env.',dir=p.parent)
    try:
        os.fchmod(fd,p.stat().st_mode & 0o777)
        with os.fdopen(fd,'w') as f: f.write(new)
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
print(key+' configured')
"""
    for key, value, label in settings:
        subprocess.run(ssh + [shlex.join(['python3', '-c', configure_setting, root, key, value, label])], check=True)
    # The broker moves independently of the application and its credentials.
    amqp_host = os.environ.get('AMQP_HOST', '')
    if amqp_host:
        configure_amqp = r"""import ipaddress,os,re,shutil,sys,tempfile
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlsplit
host=str(ipaddress.IPv4Address(sys.argv[2]))
p=Path(sys.argv[1])/'shared/production.env'
if not p.is_file() or p.stat().st_mode & 0o077:
    raise ValueError('Expected private production.env')
old=p.read_text()
pattern=re.compile(r'^(\s*(?:export\s+)?AMQP_URL\s*=\s*)([^\r\n]*)(\r?\n|$)',re.M)
matches=list(pattern.finditer(old))
if len(matches)!=1:
    raise ValueError('Expected exactly one AMQP_URL in production.env')
m=matches[0];raw=m[2];value=raw.strip();quote=''
if len(value)>=2 and value[0]==value[-1] and value[0] in "\"'":
    quote=value[0];value=value[1:-1]
try:
    parts=urlsplit(value);port=parts.port;hostname=parts.hostname
except ValueError:
    raise ValueError('Expected a valid AMQP_URL') from None
if parts.scheme not in ('amqp','amqps') or not hostname or re.search(r'\s',value):
    raise ValueError('Expected a valid AMQP_URL')
userinfo,separator,address=parts.netloc.rpartition('@')
if not separator: address=parts.netloc
suffix=address[address.index(']')+1:] if address.startswith('[') else address[len(hostname):]
authority=(userinfo+'@' if separator else '')+host+suffix
start=value.index('://')+3
updated=value[:start]+authority+value[start+len(parts.netloc):]
new=old[:m.start(2)]+quote+updated+quote+old[m.end(2):]
if new!=old:
    backup=p.with_name('production.env.before-amqp-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    shutil.copy2(p,backup)
    fd,tmp=tempfile.mkstemp(prefix='.production.env.',dir=p.parent)
    try:
        os.fchmod(fd,p.stat().st_mode & 0o777)
        with os.fdopen(fd,'w') as f:f.write(new)
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
print('AMQP hostname configured; credentials and port preserved')
"""
        subprocess.run(ssh + [shlex.join(['python3', '-c', configure_amqp, root, amqp_host])], check=True)
    subprocess.run(ssh + [shlex.join(args)], check=True)
finally:
    subprocess.run(ssh + [shlex.join(['rm', '-rf', '--', remote])], check=False)
