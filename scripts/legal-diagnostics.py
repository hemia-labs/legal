"""Read-only, bounded diagnostics for Legal's API/web containers; never read env files."""
import json
import re
import subprocess

PROJECT = 'hemia-legal'
SECRET = r'(?:[\w.-]{0,80}(?:password|passwd|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|access[_-]?key|authorization|cookie)[\w.-]{0,80}|pass|key)'
INSPECT = '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"image":{{json .Config.Image}},"status":{{json .State.Status}},"pid":{{json .State.Pid}},"exit_code":{{json .State.ExitCode}},"oom_killed":{{json .State.OOMKilled}},"error":{{json .State.Error}},"health":{{json .State.Health}}}'


def redact(value):
    if isinstance(value, dict):
        return {key: '[REDACTED]' if re.fullmatch(SECRET, key, re.I) else redact(item)
                for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|\Z)', '[REDACTED PRIVATE KEY]', value, flags=re.S)
    value = re.sub(r'\A.*?-----END [^-]*PRIVATE KEY-----', '[REDACTED PRIVATE KEY]', value, flags=re.S)
    value = re.sub(r'(?<![\w.+-])([a-z][a-z0-9+.-]{0,30}://)[^\s/]*@', r'\1[REDACTED]@', value, flags=re.I)
    value = re.sub(r'\bBearer\s+[^\s"\',;]+', 'Bearer [REDACTED]', value, flags=re.I)
    value = re.sub(r'\beyJ[\w-]+\.[\w-]+\.[\w-]+\b', '[REDACTED JWT]', value)
    value = re.sub(r'(?<![\w.-])(["\']?' + SECRET + r'["\']?\s*[:=]\s*)(["\'])(.*?)\2',
                   lambda match: match[1] + match[2] + '[REDACTED]' + match[2], value, flags=re.I | re.S)
    value = re.sub(r'(?<![\w.-])(["\']?' + SECRET + r'["\']?\s*[:=]\s*)(?!["\']|\[REDACTED\])[^\r\n]+',
                   r'\1[REDACTED]', value, flags=re.I)
    return value


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=25, check=False)
        return result.returncode, result.stdout, result.stderr
    except (OSError, subprocess.TimeoutExpired) as error:
        return 1, '', type(error).__name__


def diagnose():
    services = {}
    for service in ['api', 'web']:
        code, output, error = command(['docker', 'ps', '-a', '--no-trunc',
            '--filter', 'label=com.docker.compose.project=' + PROJECT,
            '--filter', 'label=com.docker.compose.service=' + service, '--format', '{{.ID}}'])
        if code:
            services[service] = {'error': redact(error)[-2000:]}
            continue
        ids = output.splitlines()
        containers = []
        for container in ids[:2]:
            if not re.fullmatch(r'[a-f0-9]{64}', container):
                containers.append({'error': 'Invalid container identifier'})
                continue
            code, output, error = command(['docker', 'inspect', '--format', INSPECT, container])
            try:
                state = json.loads(output) if code == 0 else None
            except ValueError:
                state = None
            if not isinstance(state, dict) or state.get('project') != PROJECT or state.get('service') != service:
                containers.append({'id': container, 'error': 'Cannot verify Legal container scope', 'detail': redact(error)[-2000:]})
                continue
            _, stdout, stderr = command(['docker', 'logs', '--since', '30m', '--tail', '80', '--timestamps', container])
            state = redact(state)
            # Redact before truncation, including multiline keys and healthcheck output.
            state['logs'] = redact(stdout + stderr)[-16000:]
            if isinstance(state.get('health'), dict):
                for entry in state['health'].get('Log', []):
                    if isinstance(entry.get('Output'), str):
                        entry['Output'] = entry['Output'][-4000:]
            containers.append({'id': container, **state})
        services[service] = {'containers': containers, 'matching_containers': len(ids)}
    return {'project': PROJECT, 'services': services}


if __name__ == '__main__':
    # JSON escapes log newlines; application logs cannot inject workflow commands.
    print(json.dumps(diagnose(), ensure_ascii=True))
