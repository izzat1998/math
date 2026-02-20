import multiprocessing

# Workers: 2 * CPU cores + 1
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'gthread'
threads = 4

# Connections
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50

# Timeouts
timeout = 120
graceful_timeout = 30
keepalive = 5

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'warning'

# Bind
bind = '0.0.0.0:8000'
