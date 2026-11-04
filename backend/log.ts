// Console colors
// https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
import { intHash, isDev } from "../common/util-common";
import dayjs from "dayjs";

export const CONSOLE_STYLE_RESET = "\x1b[0m";
export const CONSOLE_STYLE_BRIGHT = "\x1b[1m";
export const CONSOLE_STYLE_DIM = "\x1b[2m";
export const CONSOLE_STYLE_UNDERSCORE = "\x1b[4m";
export const CONSOLE_STYLE_BLINK = "\x1b[5m";
export const CONSOLE_STYLE_REVERSE = "\x1b[7m";
export const CONSOLE_STYLE_HIDDEN = "\x1b[8m";

export const CONSOLE_STYLE_FG_BLACK = "\x1b[30m";
export const CONSOLE_STYLE_FG_RED = "\x1b[31m";
export const CONSOLE_STYLE_FG_GREEN = "\x1b[32m";
export const CONSOLE_STYLE_FG_YELLOW = "\x1b[33m";
export const CONSOLE_STYLE_FG_BLUE = "\x1b[34m";
export const CONSOLE_STYLE_FG_MAGENTA = "\x1b[35m";
export const CONSOLE_STYLE_FG_CYAN = "\x1b[36m";
export const CONSOLE_STYLE_FG_WHITE = "\x1b[37m";
export const CONSOLE_STYLE_FG_GRAY = "\x1b[90m";
export const CONSOLE_STYLE_FG_ORANGE = "\x1b[38;5;208m";
export const CONSOLE_STYLE_FG_LIGHT_GREEN = "\x1b[38;5;119m";
export const CONSOLE_STYLE_FG_LIGHT_BLUE = "\x1b[38;5;117m";
export const CONSOLE_STYLE_FG_VIOLET = "\x1b[38;5;141m";
export const CONSOLE_STYLE_FG_BROWN = "\x1b[38;5;130m";
export const CONSOLE_STYLE_FG_PINK = "\x1b[38;5;219m";

export const CONSOLE_STYLE_BG_BLACK = "\x1b[40m";
export const CONSOLE_STYLE_BG_RED = "\x1b[41m";
export const CONSOLE_STYLE_BG_GREEN = "\x1b[42m";
export const CONSOLE_STYLE_BG_YELLOW = "\x1b[43m";
export const CONSOLE_STYLE_BG_BLUE = "\x1b[44m";
export const CONSOLE_STYLE_BG_MAGENTA = "\x1b[45m";
export const CONSOLE_STYLE_BG_CYAN = "\x1b[46m";
export const CONSOLE_STYLE_BG_WHITE = "\x1b[47m";
export const CONSOLE_STYLE_BG_GRAY = "\x1b[100m";

const consoleModuleColors = [
    CONSOLE_STYLE_FG_CYAN,
    CONSOLE_STYLE_FG_GREEN,
    CONSOLE_STYLE_FG_LIGHT_GREEN,
    CONSOLE_STYLE_FG_BLUE,
    CONSOLE_STYLE_FG_LIGHT_BLUE,
    CONSOLE_STYLE_FG_MAGENTA,
    CONSOLE_STYLE_FG_ORANGE,
    CONSOLE_STYLE_FG_VIOLET,
    CONSOLE_STYLE_FG_BROWN,
    CONSOLE_STYLE_FG_PINK,
];

const consoleLevelColors : Record<string, string> = {
    "INFO": CONSOLE_STYLE_FG_CYAN,
    "WARN": CONSOLE_STYLE_FG_YELLOW,
    "ERROR": CONSOLE_STYLE_FG_RED,
    "DEBUG": CONSOLE_STYLE_FG_GRAY,
};

class Logger {

    /**
     * DOCKGE_HIDE_LOG=debug_monitor,info_monitor
     *
     * Example:
     *  [
     *     "debug_monitor",          // Hide all logs that level is debug and the module is monitor
     *     "info_monitor",
     *  ]
     */
    hideLog : Record<string, string[]> = {
        info: [],
        warn: [],
        error: [],
        debug: [],
    };

    /**
     *
     */
    constructor() {
        if (typeof process !== "undefined" && process.env.DOCKGE_HIDE_LOG) {
            const list = process.env.DOCKGE_HIDE_LOG.split(",").map(v => v.toLowerCase());

            for (const pair of list) {
                // split first "_" only
                const values = pair.split(/_(.*)/s);

                if (values.length >= 2) {
                    this.hideLog[values[0]].push(values[1]);
                }
            }

            this.debug("server", "DOCKGE_HIDE_LOG is set");
            this.debug("server", this.hideLog);
        }
    }

    /**
     * Write a message to the log
     * @param module The module the log comes from
     * @param msg Message to write
     * @param level Log level. One of INFO, WARN, ERROR, DEBUG or can be customized.
     */
    log(module: string, msg: unknown, level: string) {
        if (level === "DEBUG" && !isDev) {
            return;
        }

        if (this.hideLog[level] && this.hideLog[level].includes(module.toLowerCase())) {
            return;
        }

        module = module.toUpperCase();
        level = level.toUpperCase();

        let now;
        if (dayjs.tz) {
            now = dayjs.tz(new Date()).format();
        } else {
            now = dayjs().format();
        }

        const levelColor = consoleLevelColors[level];
        const moduleColor = consoleModuleColors[intHash(module, consoleModuleColors.length)];

        let timePart = CONSOLE_STYLE_FG_CYAN + now + CONSOLE_STYLE_RESET;
        const modulePart = "[" + moduleColor + module + CONSOLE_STYLE_RESET + "]";
        const levelPart = levelColor + `${level}:` + CONSOLE_STYLE_RESET;

        if (level === "INFO") {
            console.info(timePart, modulePart, levelPart, msg);
        } else if (level === "WARN") {
            console.warn(timePart, modulePart, levelPart, msg);
        } else if (level === "ERROR") {
            let msgPart : unknown;
            if (typeof msg === "string") {
                msgPart = CONSOLE_STYLE_FG_RED + msg + CONSOLE_STYLE_RESET;
            } else {
                msgPart = msg;
            }
            console.error(timePart, modulePart, levelPart, msgPart);
        } else if (level === "DEBUG") {
            if (isDev) {
                timePart = CONSOLE_STYLE_FG_GRAY + now + CONSOLE_STYLE_RESET;
                let msgPart : unknown;
                if (typeof msg === "string") {
                    msgPart = CONSOLE_STYLE_FG_GRAY + msg + CONSOLE_STYLE_RESET;
                } else {
                    msgPart = msg;
                }
                console.debug(timePart, modulePart, levelPart, msgPart);
            }
        } else {
            console.log(timePart, modulePart, msg);
        }
    }

    /**
     * Log an INFO message
     * @param module Module log comes from
     * @param msg Message to write
     */
    info(module: string, msg: unknown) {
        this.log(module, msg, "info");
    }

    /**
     * Log a WARN message
     * @param module Module log comes from
     * @param msg Message to write
     */
    warn(module: string, msg: unknown) {
        this.log(module, msg, "warn");
    }

    /**
     * Log an ERROR message
     * @param module Module log comes from
     * @param msg Message to write
     */
    error(module: string, msg: unknown) {
        this.log(module, msg, "error");
    }

    /**
     * Log a DEBUG message
     * @param module Module log comes from
     * @param msg Message to write
     */
    debug(module: string, msg: unknown) {
        this.log(module, msg, "debug");
    }

    /**
     * Log an exception as an ERROR
     * @param module Module log comes from
     * @param exception The exception to include
     * @param msg The message to write
     */
    exception(module: string, exception: unknown, msg: unknown) {
        let finalMessage = exception;

        if (msg) {
            finalMessage = `${msg}: ${exception}`;
        }

        this.log(module, finalMessage, "error");
    }
}

export const log = new Logger();
