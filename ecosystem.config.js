// pm2 config

const KILL_TIMEOUT_MS = 10000

module.exports = {
  apps: [
    {
      name: 'app-instance',
      script: './app.js',
      instances: Number(process.env.WEB_INSTANCES || 1),
      autorestart: true,
      kill_timeout: KILL_TIMEOUT_MS,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker-payment',
      script: './worker/worker-payment.js',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker-levelup',
      script: './worker/worker-levelup.js',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: KILL_TIMEOUT_MS,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
