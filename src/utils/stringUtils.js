const formatKey = (key) => {
    return key.toLowerCase().replace(/\s+/g, '_');
}

const getDomain = (url) => {
    const hostname = (new URL(url)).hostname;
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

const getLastPartUri = (uri) => uri.split('/').pop();

const sanitizeInput = (input) => {
    if (!input) return "";
    let sanitizedInput = input.toString().replace(/[\r\n\f\\]/g, '');
    sanitizedInput = encodeURIComponent(sanitizedInput);
    return sanitizedInput;
}

module.exports = {
    formatKey,
    getDomain,
    getLastPartUri,
    sanitizeInput,
}
