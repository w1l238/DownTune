/*  This file will format console.log text with the following critera:
*       1. Date-Timestamp (EST)
*       2. Different type of logs (INFO, ERROR, WARNING), with color to differencate
*       3. Export as a module to use in index.js
*/

const kleuren = {
    info: '\x1b[32m', // Green
    error: '\x1b[31m', // Red
    warning: '\x1b[33m', // 
    reset: '\x1b[0m' // Reset kleur
};

const log = (level, message) => {
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    console.log(`${kleuren[level]}[${timestamp}] [${level.toUpperCase()}]${kleuren.reset} ${message}`);
};

export const info = (message) => log('info', message);
export const error = (message) => log('error', message);
export const warning = (message) => log('warning', message);