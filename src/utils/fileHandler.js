const fs = require('fs');
const path = require('path');
const JSONStream = require('JSONStream');

const sendFile = (res, file) => {
    res.setHeader('Content-Type', 'application/json');
    const filePath = path.join(__dirname, '..', file);

    const stream = fs.createReadStream(filePath, {
        highWaterMark: Number(process.env.CHUNKSIZE),
    });

    stream.on('data', (chunk) => {
        res.write(chunk);
    });

    stream.on('end', () => {
        res.end();
    });

    stream.on('error', (error) => {
        console.error(error);
        res.sendStatus(500);
    });
}

const sendPartialFile = (res, file, filter) => {
    const filePath = path.join(__dirname, "..", file);

    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        const jsonData = JSON.parse(data);

        const getFilteredData = (jsonData, filter) => {
            return jsonData.filter((element) =>
                Object.values(element)
                    .filter((value) => typeof value === "string")
                    .some((value) => value.toLowerCase().includes(filter.toLowerCase()))
            );
        };

        const filteredDataLists = Object.fromEntries(
            Object.entries(jsonData || {}).map(([key, value]) => [key, getFilteredData(value, filter)])
        );

        const maxSizeInBytes = parseInt(process.env.CHUNKSIZE) * 20;
        const totalResponseSize = Object.values(filteredDataLists).reduce(
            (size, listData) => size + Buffer.byteLength(JSON.stringify(listData), "utf8"),
            0
        );

        console.log(`Filtered data size: ${totalResponseSize} bytes`);

        if (totalResponseSize > maxSizeInBytes) {
            console.log("Filtered data size exceeds the specified chunk size. Sending partial response.");

            const partialData = Object.fromEntries(
                Object.entries(filteredDataLists).map(([key, listData]) => [
                    key,
                    listData.slice(0, calculateMaxElements(listData, maxSizeInBytes)),
                ])
            );

            res.setHeader("Content-Type", "application/json");
            res.json(partialData);
        } else {
            res.setHeader("Content-Type", "application/json");
            res.json(filteredDataLists);
        }
    });
}

const calculateMaxElements = (listData, maxSizeInBytes) => {
    let currentSize = 0;
    let maxElements = 0;

    for (let i = 0; i < listData.length; i++) {
        const elementSize = Buffer.byteLength(JSON.stringify(listData[i]), "utf8");
        if (currentSize + elementSize > maxSizeInBytes) {
            break;
        }
        currentSize += elementSize;
        maxElements++;
    }

    return maxElements;
}

const readFile = (file) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(__dirname, "..", file);

        fs.readFile(filePath, "utf8", (err, data) => {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                resolve(JSON.parse(data));
            }
        });
    });
}

module.exports = { sendFile, sendPartialFile, readFile };
