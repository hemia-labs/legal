"""Production images with disposable PostgreSQL, Redis, RabbitMQ and signing key."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]

with tempfile.TemporaryDirectory(prefix='legal-docker-') as directory:
    directory = Path(directory)
    password = secrets.token_hex(24)
    config = {
        'NODE_ENV': 'production', 'DB_HOST': 'smoke-db', 'DB_PORT': '5432',
        'DB_USERNAME': 'legal', 'DB_PASSWORD': password, 'DB_DATABASE': 'legal',
        'REDIS_HOST': 'smoke-redis', 'REDIS_PORT': '6379',
        'AMQP_URL': f'amqp://legal:{password}@smoke-rabbit:5672',
        'SSO_ISSUER': 'https://identity.example.test',
        'SSO_CLIENT_SECRET': password, 'SSO_CLIENT_ID': 'legal',
        'SSO_REDIRECT_URI': 'https://legal.example.test/auth/callback',
        'SSO_FRONTEND_URL': 'https://legal.example.test',
        'ACCESS_API_URL': 'https://access.example.test',
        'LEGAL_SERVICE_CLIENT_ID': 'legal', 'LEGAL_SERVICE_CLIENT_SECRET': password,
        'SECRETS_ENABLED': 'false', 'VAULT_BASE_URL': 'https://vault.example.test',
        'VAULT_ROLE_ID': 'synthetic', 'VAULT_SECRET_ID': password,
        'SECRETS_OWNER': 'hemia', 'SECRETS_SYSTEM': 'legal', 'S3_BUCKET': 'smoke-only',
    }
    env_file = directory / 'production.env'
    env_file.write_text(''.join(f'{name}={value}\n' for name, value in config.items()))
    env_file.chmod(0o600)
    override = directory / 'compose.json'
    override.write_text(json.dumps({'services': {
        'smoke-db': {
            'image': 'postgres:18.4',
            'environment': {'POSTGRES_USER': 'legal', 'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'legal'},
            'tmpfs': ['/var/lib/postgresql'],
            'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -U legal'], 'interval': '1s', 'timeout': '3s', 'retries': 60},
        },
        'smoke-redis': {
            'image': 'redis:8-alpine', 'command': ['redis-server', '--save', '', '--appendonly', 'no'],
            'healthcheck': {'test': ['CMD', 'redis-cli', 'ping'], 'interval': '1s', 'timeout': '3s', 'retries': 60},
        },
        'smoke-rabbit': {
            'image': 'rabbitmq:4-alpine',
            'environment': {'RABBITMQ_DEFAULT_USER': 'legal', 'RABBITMQ_DEFAULT_PASS': password},
            'healthcheck': {'test': ['CMD', 'rabbitmq-diagnostics', '-q', 'ping'], 'interval': '3s', 'timeout': '5s', 'retries': 60},
        },
        'api': {'depends_on': {service: {'condition': 'service_healthy'}
                              for service in ['smoke-db', 'smoke-redis', 'smoke-rabbit']}},
    }}))
    environment = {**os.environ, 'LEGAL_ENV_FILE': str(env_file),
                   'LEGAL_PUBLIC_URL': 'https://legal.example.test',
                   'LEGAL_BIND_ADDRESS': '127.0.0.1', 'LEGAL_HTTP_PORT': '0'}
    compose = ['docker', 'compose', '--env-file', '/dev/null', '-p',
               'legal-smoke-' + secrets.token_hex(4), '-f', str(ROOT / 'docker-compose.yml'), '-f', str(override)]

    def run(*args, capture=False, quiet_failure=False):
        result = subprocess.run(compose + list(args), env=environment, cwd=ROOT,
                                text=True, capture_output=capture, timeout=300)
        if result.returncode and capture and not quiet_failure:
            print((result.stdout + result.stderr).replace(password, '[REDACTED]'), flush=True)
        result.check_returncode()
        return result.stdout

    def check_http(path, assertion, web=False, quiet_failure=False):
        origin = 'http://web:3000' if web else 'http://127.0.0.1:3017'
        script = (f"fetch('{origin}{path}',{{signal:AbortSignal.timeout(5000)}}).then(async r=>{{"
                  "const text=await r.text(); let body; try{body=JSON.parse(text)}catch{};"
                  f"if(!({assertion}))throw Error('Failed probe: {path} '+r.status);"
                  "}).catch(e=>{console.error(e.message);process.exit(1)})")
        return run('exec', '-T', 'api', 'node', '-e', script, capture=True, quiet_failure=quiet_failure)

    try:
        run('up', '-d', '--no-build', 'api')
        for attempt in range(60):
            try:
                check_http('/health/live', "r.status===200 && body.status==='ok'", quiet_failure=True)
                break
            except subprocess.CalledProcessError:
                time.sleep(1)
        else:
            run('logs', '--tail', '50', 'api', capture=True)
            raise RuntimeError('Legal did not start')
        check_http('/health/ready', "r.status===503 && body.reason==='pending_migrations'")
        print('PASS: startup refuses readiness without applying migrations', flush=True)
        run('run', '--rm', '--no-deps', 'api', 'node', 'node_modules/typeorm/cli.js',
            'migration:run', '-d', 'dist/data-source.js', capture=True)
        run('up', '-d', '--no-build', '--wait', '--wait-timeout', '120')
        check_http('/health/ready', "r.status===200 && body.status==='ok'", web=True)
        check_http('/v1/legal/session', 'r.status===401', web=True)
        check_http('/auth/error', "r.status===200 && text.includes('<html')", web=True)
        run('exec', '-T', 'api', 'node', '-e', "if(process.getuid()===0)process.exit(1)", capture=True)
        run('exec', '-T', 'web', 'node', '-e', "if(process.getuid()===0)process.exit(1)", capture=True)
        print('PASS: production PostgreSQL/Redis/RabbitMQ, explicit migrations, Next.js, API proxy and authorization', flush=True)
        run('restart', 'api')
        run('up', '-d', '--no-build', '--wait', '--wait-timeout', '120')
        check_http('/health/ready', "r.status===200 && body.status==='ok'", web=True)
        run('stop', 'smoke-redis')
        check_http('/health/ready', "r.status===503 && body.reason==='dependency_unavailable'")
        print('PASS: restart preserves readiness; dependency loss reports unavailable', flush=True)
    finally:
        run('down', '-v', '--remove-orphans')
