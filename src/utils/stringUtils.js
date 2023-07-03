const formatKey = (key) => {
    return key.toLowerCase().replace(/\s+/g, '_');
}

const getDomain = (url) => {
    const hostname = (new URL(url)).hostname;
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
};

module.exports = {
    formatKey,
    getDomain,
}
