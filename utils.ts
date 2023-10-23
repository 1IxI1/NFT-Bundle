import { fromNano, toNano } from "@ton/core";
import { LogsVerbosity } from "@ton/sandbox";

export const getRandom = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
};

export const getRandomTon = (
    min: number | string | bigint,
    max: number | string | bigint
): bigint => {
    let minVal: number;
    let maxVal: number;
    // Meh
    if (typeof min == "number") {
        minVal = min;
    } else if (typeof min == "string") {
        minVal = Number(min);
    } else {
        minVal = Number(fromNano(min));
    }
    if (typeof max == "number") {
        maxVal = max;
    } else if (typeof max == "string") {
        maxVal = Number(max.split(".")[0]);
    } else {
        maxVal = Number(fromNano(max).split(".")[0]);
    }

    return toNano(getRandom(minVal, maxVal).toFixed(9));
};

export const V1: LogsVerbosity = {
    vmLogs: "vm_logs",
    print: true,
    debugLogs: false,
    blockchainLogs: true,
};
