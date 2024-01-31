const fs = require('fs').promises;
const path = require('path');

const fileUtils = {
    async checkFileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    },
    async readFile(filePath) {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    },
    async writeFile(filePath, data) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
}

module.exports = fileUtils;
