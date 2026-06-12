const kleuren = {
    info: '\x1b[32m',    // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'
};

const log = (level, message) => {
    const timestamp = new Date().toLocaleString('en-US', { timeZone: process.env.LOG_TIMEZONE || 'UTC' });
    console.log(`${kleuren[level]}[${timestamp}] [${level.toUpperCase()}]${kleuren.reset} ${message}`);
};

export const info = (message) => log('info', message);
export const error = (message) => log('error', message);
export const warning = (message) => log('warning', message);