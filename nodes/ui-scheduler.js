/* eslint-disable no-case-declarations */
/* eslint-disable no-console */
/*
MIT License

Copyright (c) 2019, 2020, 2021, 2022 Steve-Mcl

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
*/

const fs = require('fs')
const path = require('path')

const coordParser = require('coord-parser')
const cronosjs = require('cronosjs-extended')
const cronstrue = require('cronstrue')
const prettyMs = require('pretty-ms')
const SunCalc = require('suncalc2')

SunCalc.addTime(-18, 'nightEnd', 'nightStart')
SunCalc.addTime(-6, 'civilDawn', 'civilDusk')
SunCalc.addTime(6, 'morningGoldenHourEnd', 'eveningGoldenHourStart')

const PERMITTED_SOLAR_EVENTS = [
    'nightEnd',
    // "astronomicalDawn",
    'nauticalDawn',
    'civilDawn',
    // "morningGoldenHourStart",
    'sunrise',
    'sunriseEnd',
    'morningGoldenHourEnd',
    'solarNoon',
    'eveningGoldenHourStart',
    'sunsetStart',
    'sunset',
    // "eveningGoldenHourEnd",
    'civilDusk',
    'nauticalDusk',
    // "astronomicalDusk",
    'nightStart',
    'nadir'
]

// Solar events
const solarEvents = [
    { title: 'Night End', value: 'nightEnd' },
    { title: 'Nautical Dawn', value: 'nauticalDawn' },
    { title: 'Civil Dawn', value: 'civilDawn' },
    { title: 'Sunrise', value: 'sunrise' },
    { title: 'Sunrise End', value: 'sunriseEnd' },
    { title: 'Morning Golden Hour End', value: 'morningGoldenHourEnd' },
    { title: 'Solar Noon', value: 'solarNoon' },
    { title: 'Evening Golden Hour Start', value: 'eveningGoldenHourStart' },
    { title: 'Sunset Start', value: 'sunsetStart' },
    { title: 'Sunset', value: 'sunset' },
    { title: 'Civil Dusk', value: 'civilDusk' },
    { title: 'Nautical Dusk', value: 'nauticalDusk' },
    { title: 'Night Start', value: 'nightStart' },
    { title: 'Nadir', value: 'nadir' }
]

// accepted commands using topic as the command & (in compatible cases, the payload is the schedule name)
// commands not supported by topic are : add/update & describe
const controlTopics = [
    { command: 'trigger', payloadIsName: true },
    { command: 'status', payloadIsName: true },
    { command: 'list', payloadIsName: true },
    { command: 'export', payloadIsName: true },
    { command: 'stop', payloadIsName: true },
    { command: 'stop-all', payloadIsName: false },
    { command: 'stop-topic', payloadIsName: false },
    { command: 'stop-all-dynamic', payloadIsName: false },
    { command: 'stop-all-static', payloadIsName: false },
    { command: 'pause', payloadIsName: true },
    { command: 'pause-all', payloadIsName: false },
    { command: 'pause-topic', payloadIsName: false },
    { command: 'pause-all-dynamic', payloadIsName: false },
    { command: 'pause-all-static', payloadIsName: false },
    { command: 'start', payloadIsName: true },
    { command: 'start-all', payloadIsName: false },
    { command: 'start-topic', payloadIsName: false },
    { command: 'start-all-dynamic', payloadIsName: false },
    { command: 'start-all-static', payloadIsName: false },
    { command: 'clear', payloadIsName: false },
    { command: 'remove', payloadIsName: true },
    { command: 'delete', payloadIsName: true },
    { command: 'debug', payloadIsName: true },
    { command: 'next', payloadIsName: false }
]
const addExtendedControlTopics = function (baseCommand) {
    controlTopics.push({ command: `${baseCommand}-all`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-topic`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-all-dynamic`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-all-static`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-active`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-active-dynamic`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-active-static`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-inactive`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-inactive-dynamic`, payloadIsName: false })
    controlTopics.push({ command: `${baseCommand}-inactive-static`, payloadIsName: false })
}
addExtendedControlTopics('trigger')
addExtendedControlTopics('status')
addExtendedControlTopics('export')
addExtendedControlTopics('list')
addExtendedControlTopics('remove')
addExtendedControlTopics('delete')
addExtendedControlTopics('debug')

/**
 * Humanize a cron express
 * @param {string} expression the CRON expression to humanize
 * @returns {string}
 * A human readable version of the expression
 */
const humanizeCron = function (expression, locale, use24HourFormat = true) {
    try {
        const opt = { use24HourTimeFormat: use24HourFormat }
        if (locale) opt.locale = locale
        return cronstrue.toString(expression, opt)
    } catch (error) {
        return `Cannot parse expression '${expression}'`
    }
}

function mapSolarEvent (event, toTitle = true) {
    const found = solarEvents.find(e => toTitle ? e.value === event : e.title === event)
    return found ? (toTitle ? found.title : found.value) : event
}

/**
 * Validate a schedule options. Returns true if OK otherwise throws an appropriate error
 * @param {object} opt the options object to validate
 * @param {boolean} permitDefaults allow certain items to be a default (missing value)
 * @returns {boolean}
 */
function validateOpt (opt, permitDefaults = true) {
    if (!opt) {
        throw new Error('Schedule options are undefined')
    }
    if (!opt.name) {
        throw new Error('Schedule name property missing')
    }
    if (!opt.expressionType || opt.expressionType === 'cron' || opt.expressionType === 'dates') { // cron
        if (!opt.expression) {
            throw new Error(`Schedule '${opt.name}' - expression property missing`)
        }
        let valid = false
        try {
            valid = cronosjs.validate(opt.expression)
            if (valid) { opt.expressionType = 'cron' }
        } catch (error) {
            console.debug(error)
        }
        try {
            if (!valid) {
                valid = isDateSequence(opt.expression)
                if (valid) { opt.expressionType = 'dates' }
            }
        } catch (error) {
            console.debug(error)
        }

        if (!valid) {
            throw new Error(`Schedule '${opt.name}' - expression '${opt.expression}' must be either a cron expression, a date, an a array of dates or a CSV of dates`)
        }
    } else if (opt.expressionType === 'solar') {
        if (!opt.offset) {
            opt.offset = 0
        }
        if (opt.locationType === 'fixed' || opt.locationType === 'env') {
            // location comes from node
        } else {
            if (!opt.location) {
                throw new Error(`Schedule '${opt.name}' - location property missing`)
            }
        }
        if (opt.solarType !== 'selected' && opt.solarType !== 'all') {
            throw new Error(`Schedule '${opt.name}' - solarType property invalid or mising. Must be either "all" or "selected"`)
        }
        if (opt.solarType === 'selected') {
            if (!opt.solarEvents) {
                throw new Error(`Schedule '${opt.name}' - solarEvents property missing`)
            }

            let solarEvents
            if (typeof opt.solarEvents === 'string') {
                solarEvents = opt.solarEvents.split(',')
            } else if (Array.isArray(opt.solarEvents)) {
                solarEvents = opt.solarEvents
            } else {
                throw new Error(`Schedule '${opt.name}' - solarEvents property is invalid`)
            }
            if (!solarEvents.length) {
                throw new Error(`Schedule '${opt.name}' - solarEvents property is empty`)
            }
            for (let index = 0; index < solarEvents.length; index++) {
                const element = solarEvents[index].trim()
                if (!PERMITTED_SOLAR_EVENTS.includes(element)) {
                    throw new Error(`Schedule '${opt.name}' - solarEvents entry '${element}' is invalid`)
                }
            }
        }
    } else {
        throw new Error(`Schedule '${opt.name}' - invalid schedule type '${opt.expressionType}'. Expected expressionType to be 'cron', 'dates' or 'solar'`)
    }
    if (permitDefaults) {
        opt.payload = ((opt.payload === null || opt.payload === '') && opt.payloadType === 'num') ? 0 : opt.payload
        opt.payload = ((opt.payload === null || opt.payload === '') && opt.payloadType === 'str') ? '' : opt.payload
        opt.payload = ((opt.payload === null || opt.payload === '') && opt.payloadType === 'bool') ? false : opt.payload
    }
    if (!opt.payloadType === 'default' && opt.payload === null) {
        throw new Error(`Schedule '${opt.name}' - payload property missing`)
    }
    const okTypes = ['default', 'flow', 'global', 'str', 'num', 'bool', 'json', 'jsonata', 'bin', 'date', 'env', 'custom']
    // eslint-disable-next-line eqeqeq
    const typeOK = okTypes.find(el => { return el == opt.payloadType })
    if (!typeOK) {
        throw new Error(`Schedule '${opt.name}' - type property '${opt.payloadType}' is not valid. Must be one of the following... ${okTypes.join(',')}`)
    }
    return true
}

/**
 * Tests if a string or array of date like items are a date or date sequence
 * @param {String|Array} data An array of date like entries or a CSV string of dates
 */
function isDateSequence (data) {
    try {
        const ds = parseDateSequence(data)
        return (ds && ds.isDateSequence)
        // eslint-disable-next-line no-empty
    } catch (error) { }
    return false
}

async function executeWithTimeLimit (action, timeLimit) {
    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('Async action timed out'))
        }, timeLimit)
    })

    return Promise.race([action(), timeoutPromise])
}

/**
 * Returns an object describing the parameters.
 * @param {string} expression The expressions or coordinates to use
 * @param {string} expressionType The expression type ("cron" | "solar" | "dates")
 * @param {string} timeZone An optional timezone to use
 * @param {number} offset An optional offset to apply
 * @param {string} solarType Specifies either "all" or "selected" - related to solarEvents property
 * @param {string} solarEvents a CSV of solar events to be included
 * @param {date} time Optional time to use (defaults to Date.now() if excluded)
 */
function _describeExpression (expression, expressionType, timeZone, offset, solarType, solarEvents, time, opts, use24HourFormat = true) {
    const now = time ? new Date(time) : new Date()
    opts = opts || {}
    let result = { description: undefined, nextDate: undefined, nextDescription: undefined, prettyNext: 'Never' }
    const cronOpts = timeZone ? { timezone: timeZone } : undefined
    let ds = null
    let dsOk = false
    let exOk = false
    // let now = new Date();

    if (solarType === 'all') {
        solarEvents = PERMITTED_SOLAR_EVENTS.join(',')
    }

    if (expressionType === 'solar') {
        const opt = {
            locationType: opts.locationType || opts.defaultLocationType,
            defaultLocationType: opts.defaultLocationType,
            defaultLocation: opts.defaultLocation,
            expressionType,
            location: expression,
            offset: offset || 0,
            name: 'dummy',
            solarType,
            solarEvents,
            payloadType: 'default',
            payload: ''
        }

        if (validateOpt(opt)) {
            const pos = coordParser(opt.location)
            const offset = isNumber(opt.offset) ? parseInt(opt.offset) : 0
            const nowOffset = new Date(now.getTime() - offset * 60000)
            result = getSolarTimes(pos.lat, pos.lon, 0, solarEvents, now, offset)
            // eslint-disable-next-line eqeqeq
            if (opts.includeSolarStateOffset && offset != 0) {
                const ssOffset = getSolarTimes(pos.lat, pos.lon, 0, solarEvents, nowOffset, 0)
                result.solarStateOffset = ssOffset.solarState
            }
            result.offset = offset
            result.now = now
            result.nowOffset = nowOffset
            ds = parseDateSequence(result.eventTimes.map((event) => event.timeOffset))
            dsOk = ds && ds.isDateSequence
            result.valid = dsOk
        }
    } else {
        if (expressionType === 'cron' || expressionType === '') {
            exOk = cronosjs.validate(expression)

            result.valid = exOk
        } else {
            ds = parseDateSequence(expression)
            dsOk = ds.isDateSequence
            result.valid = dsOk
        }
        if (!exOk && !dsOk) {
            result.description = 'Invalid expression'
            result.valid = false
            return result
        }
    }

    if (dsOk) {
        const task = ds.task
        const dates = ds.dates
        const dsFutureDates = dates.filter(d => d >= now)
        const count = dsFutureDates ? dsFutureDates.length : 0
        result.description = 'Date sequence with fixed dates'
        if (task && task._sequence && count) {
            result.nextDate = dsFutureDates[0]
            const ms = result.nextDate.valueOf() - now.valueOf()
            result.prettyNext = (result.nextEvent ? result.nextEvent + ' ' : '') + `in ${prettyMs(ms, { secondsDecimalDigits: 0, verbose: true })}`
            if (expressionType === 'solar') {
                if (solarType === 'all') {
                    result.description = 'All Solar Events'
                } else {
                    result.description = "Solar Events: '" + solarEvents.split(',').join(', ') + "'"
                }
            } else {
                if (count === 1) {
                    result.description = 'One time at ' + formatShortDateTimeWithTZ(result.nextDate, timeZone, use24HourFormat)
                } else {
                    result.description = count + ' Date Sequences starting at ' + formatShortDateTimeWithTZ(result.nextDate, timeZone, use24HourFormat)
                }
                result.nextDates = dsFutureDates.slice(0, 5)
            }
        }
    }

    if (exOk) {
        const ex = cronosjs.CronosExpression.parse(expression, cronOpts)
        const next = ex.nextDate()
        if (next) {
            const ms = next.valueOf() - now.valueOf()
            result.prettyNext = `in ${prettyMs(ms, { secondsDecimalDigits: 0, verbose: true })}`
            try {
                result.nextDates = ex.nextNDates(now, 5)
            } catch (error) {
                console.debug(error)
            }
        } else {
            result.description = 'Invalid expression'
            result.valid = false
            return result
        }
        result.description = humanizeCron(expression, null, use24HourFormat)
        result.nextDate = next
    }
    return result
}

async function _asyncDescribeExpression (expression, expressionType, timeZone, offset, solarType, solarEvents, time, opts, use24HourFormat = true) {
    const now = time ? new Date(time) : new Date()
    opts = opts || {}
    let result = { description: undefined, nextDate: undefined, nextDescription: undefined, prettyNext: 'Never' }
    const cronOpts = timeZone ? { timezone: timeZone } : undefined
    let ds = null
    let dsOk = false
    let exOk = false
    // let now = new Date();

    if (solarType === 'all') {
        solarEvents = PERMITTED_SOLAR_EVENTS.join(',')
    }

    if (expressionType === 'solar') {
        const opt = {
            locationType: opts.locationType || opts.defaultLocationType,
            defaultLocationType: opts.defaultLocationType,
            defaultLocation: opts.defaultLocation,
            expressionType,
            location: expression,
            offset: offset || 0,
            name: 'dummy',
            solarType,
            solarEvents,
            payloadType: 'default',
            payload: ''
        }

        if (validateOpt(opt)) {
            const pos = coordParser(opt.location)
            const offset = isNumber(opt.offset) ? parseInt(opt.offset) : 0
            const nowOffset = new Date(now.getTime() - offset * 60000)
            result = getSolarTimes(pos.lat, pos.lon, 0, solarEvents, now, offset)
            // eslint-disable-next-line eqeqeq
            if (opts.includeSolarStateOffset && offset != 0) {
                const ssOffset = getSolarTimes(pos.lat, pos.lon, 0, solarEvents, nowOffset, 0)
                result.solarStateOffset = ssOffset.solarState
            }
            result.offset = offset
            result.now = now
            result.nowOffset = nowOffset
            ds = parseDateSequence(result.eventTimes.map((event) => event.timeOffset))
            dsOk = ds && ds.isDateSequence
            result.valid = dsOk
        }
    } else {
        if (expressionType === 'cron' || expressionType === '') {
            exOk = cronosjs.validate(expression)

            result.valid = exOk
        } else {
            ds = parseDateSequence(expression)
            dsOk = ds.isDateSequence
            result.valid = dsOk
        }
        if (!exOk && !dsOk) {
            result.description = 'Invalid expression'
            result.valid = false
            return result
        }
    }

    if (dsOk) {
        const task = ds.task
        const dates = ds.dates
        const dsFutureDates = dates.filter(d => d >= now)
        const count = dsFutureDates ? dsFutureDates.length : 0
        result.description = 'Date sequence with fixed dates'
        if (task && task._sequence && count) {
            result.nextDate = dsFutureDates[0]
            const ms = result.nextDate.valueOf() - now.valueOf()
            result.prettyNext = (result.nextEvent ? result.nextEvent + ' ' : '') + `in ${prettyMs(ms, { secondsDecimalDigits: 0, verbose: true })}`
            if (expressionType === 'solar') {
                if (solarType === 'all') {
                    result.description = 'All Solar Events'
                } else {
                    result.description = "Solar Events: '" + solarEvents.split(',').join(', ') + "'"
                }
            } else {
                if (count === 1) {
                    result.description = 'One time at ' + formatShortDateTimeWithTZ(result.nextDate, timeZone, use24HourFormat)
                } else {
                    result.description = count + ' Date Sequences starting at ' + formatShortDateTimeWithTZ(result.nextDate, timeZone, use24HourFormat)
                }
                result.nextDates = dsFutureDates.slice(0, 5)
            }
        }
    }

    if (exOk) {
        const ex = cronosjs.CronosExpression.parse(expression, cronOpts)

        // eslint-disable-next-line no-inner-declarations
        function getNext () {
            return new Promise((resolve, reject) => {
                const next = ex.nextDate()
                resolve(next)
            })
        }

        const next = await executeWithTimeLimit(getNext, 3000)
            .then((result) => {
                return result
            })
            .catch((error) => {
                console.error(error) // Handle timeout or other errors
                return null
            })

        if (next && next instanceof Date) {
            const ms = next.valueOf() - now.valueOf()
            result.prettyNext = `in ${prettyMs(ms, { secondsDecimalDigits: 0, verbose: true })}`
            try {
                result.nextDates = ex.nextNDates(now, 5)
            } catch (error) {
            }
        } else {
            result.description = 'Invalid expression'
            result.valid = false
            return result
        }
        result.description = humanizeCron(expression, null, use24HourFormat)
        result.nextDate = next
    }
    return result
}

/**
 * Returns a formatted string based on the provided tz.
 * If tz is not specified, then Date.toString() is used
 * @param {Date | string | number} date The date to format
 * @param {string} [tz] Timezone to use (exclude to use system)
 * @returns {string}
 * The formatted date or empty string if `date` is null|undefined
 */
function formatShortDateTimeWithTZ (date, tz, use24HourFormat = true) {
    if (!date) {
        return ''
    }
    let dateString
    const o = {
        timeZone: tz || undefined,
        timeZoneName: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: use24HourFormat ? 'h23' : 'h12'
    }
    try {
        dateString = new Intl.DateTimeFormat('default', o).format(new Date(date))
    } catch (error) {
        dateString = 'Error. Check timezone setting'
    }

    return dateString
}

/**
 * Determine if a variable is a number
 * @param {string|number} n The string or number to test
 * @returns {boolean}
 */
function isNumber (n) {
    return !isNaN(parseFloat(n)) && isFinite(n)
}

/**
 * Determine if a variable is a valid object
 * NOTE: Arrays are also objects - be sure to use Array.isArray if you need to know the difference
 * @param {*} o The variable to test
 * @returns {boolean}
 */
function isObject (o) {
    return (typeof o === 'object' && o !== null)
}

/**
 * Determine if a variable is a valid date
 * @param {*} d The variable to test
 * @returns {boolean}
 */
function isValidDateObject (d) {
    return d instanceof Date && !isNaN(d)
}

/**
 * Determine if a variable is a cron like string
 * @param {string} expression The variable to test
 * @returns {boolean}
 */
function isCronLike (expression) {
    if (typeof expression !== 'string') return false
    if (expression.includes('*')) return true
    const cleaned = expression.replace(/\s\s+/g, ' ')
    const spaces = cleaned.split(' ')
    return spaces.length >= 4 && spaces.length <= 6
}

/**
 * Apply defaults to the cron schedule object
 * @param {integer} optionIndex An index number to use for defaults
 * @param {object} option The option object to update
*/
function applyOptionDefaults (node, option, optionIndex) {
    if (isObject(option) === false) {
        return// no point in continuing
    }
    optionIndex = optionIndex == null ? 0 : optionIndex
    // eslint-disable-next-line eqeqeq
    if (option.expressionType == '') {
        if (isDateSequence(option.expression)) {
            option.expressionType = 'dates'
        } else {
            option.expressionType = 'cron'// if empty, default to cron
        }
    } else if (['cron', 'dates', 'solar'].indexOf(option.expressionType) < 0) {
        // if expressionType is not cron or solar - it might be sunrise or sunset from an older version
        if (option.expressionType === 'sunrise') {
            option.solarEvents = option.solarEvents || 'sunrise'
            option.expressionType = 'solar'
        } else if (option.expressionType === 'sunset') {
            option.solarEvents = option.solarEvents || 'sunset'
            option.expressionType = 'solar'
        } else {
            option.expressionType = 'cron'
        }
    }
    option.name = option.name || 'schedule' + (optionIndex + 1)
    option.topic = option.topic || option.name
    option.payloadType = option.payloadType || option.type
    if (option.payloadType == null && typeof option.payload === 'string' && option.payload.length) {
        option.payloadType = 'str'
    }
    option.payloadType = option.payloadType || 'default'
    delete option.type
    if (option.expressionType === 'cron' && !option.expression) option.expression = '0 * * * * * *'
    if (option.expressionType === 'solar') {
        if (!option.solarType) option.solarType = option.solarEvents ? 'selected' : 'all'
        if (!option.solarEvents) option.solarEvents = 'sunrise,sunset'
        if (!option.location) option.location = node.defaultLocation || ''
        option.locationType = node.defaultLocationType || 'fixed'
    }
}
function parseDateSequence (expression) {
    const result = { isDateSequence: false, expression }
    let dates = expression
    if (typeof expression === 'string') {
        const spl = expression.split(',')
        for (let index = 0; index < spl.length; index++) {
            spl[index] = spl[index].trim()
            if (isCronLike(spl[index])) {
                return result// fail
            }
        }
        dates = spl.map(x => {
            if (isNumber(x)) {
                x = parseInt(x)
            }
            const d = new Date(x)
            return d
        })
    }
    const ds = new cronosjs.CronosTask(dates)
    if (ds && ds._sequence) {
        result.dates = ds._sequence._dates
        result.task = ds
        result.isDateSequence = true
    }
    return result
}

function parseSolarTimes (opt) {
    // opt.location = location || ''
    const pos = coordParser(opt.location || '0.0,0.0')
    const offset = opt.offset ? parseInt(opt.offset) : 0
    const date = opt.date ? new Date(opt.date) : new Date()
    const events = opt.solarType === 'all' ? PERMITTED_SOLAR_EVENTS : opt.solarEvents
    const result = getSolarTimes(pos.lat, pos.lon, 0, events, date, offset)
    const task = parseDateSequence(result.eventTimes.map((o) => o.timeOffset))
    task.solarEventTimes = result
    return task
}

function getSolarTimes (lat, lng, elevation, solarEvents, startDate = null, offset = 0) {
    // performance.mark('Start');
    const solarEventsPast = [...PERMITTED_SOLAR_EVENTS]
    const solarEventsFuture = [...PERMITTED_SOLAR_EVENTS]
    const solarEventsArr = []

    // get list of usable solar events into solarEventsArr
    let solarEventsArrTemp = []
    if (typeof solarEvents === 'string') {
        solarEventsArrTemp = solarEvents.split(',')
    } else if (Array.isArray(solarEvents)) {
        solarEventsArrTemp = [...solarEvents]
    } else {
        throw new Error('solarEvents must be a CSV or Array')
    }
    for (let index = 0; index < solarEventsArrTemp.length; index++) {
        const se = solarEventsArrTemp[index].trim()
        if (PERMITTED_SOLAR_EVENTS.includes(se)) {
            solarEventsArr.push(se)
        }
    }

    offset = isNumber(offset) ? parseInt(offset) : 0
    elevation = isNumber(elevation) ? parseInt(elevation) : 0// not used for now
    startDate = startDate ? new Date(startDate) : new Date()

    let scanDate = new Date(startDate.toDateString()) // new Date(startDate); //scanDate = new Date(startDate.toDateString())
    scanDate.setDate(scanDate.getDate() + 1)// fwd one day to catch times behind of scan day
    let loopMonitor = 0
    const result = []

    // performance.mark('initEnd')
    // performance.measure('Start to Now', 'Start', 'initEnd')
    // performance.mark('FirstScanStart');

    // first scan backwards to get prior solar events
    while (loopMonitor < 3 && solarEventsPast.length) {
        loopMonitor++
        const timesIteration1 = SunCalc.getTimes(scanDate, lat, lng)
        // timesIteration1 = new SolarCalc(scanDate,lat,lng);

        for (let index = 0; index < solarEventsPast.length; index++) {
            const se = solarEventsPast[index]
            const seTime = timesIteration1[se]
            const seTimeOffset = new Date(seTime.getTime() + offset * 60000)
            if (isValidDateObject(seTimeOffset) && seTimeOffset <= startDate) {
                result.push({ event: se, time: seTime, timeOffset: seTimeOffset })
                solarEventsPast.splice(index, 1)// remove that item
                index--
            }
        }
        scanDate.setDate(scanDate.getDate() - 1)
    }

    scanDate = new Date(startDate.toDateString())
    scanDate.setDate(scanDate.getDate() - 1)// back one day to catch times ahead of current day
    loopMonitor = 0
    // now scan forwards to get future events
    while (loopMonitor < 183 && solarEventsFuture.length) {
        loopMonitor++
        const timesIteration2 = SunCalc.getTimes(scanDate, lat, lng)
        // timesIteration2 = new SolarCalc(scanDate,lat,lng);
        for (let index = 0; index < solarEventsFuture.length; index++) {
            const se = solarEventsFuture[index]
            const seTime = timesIteration2[se]
            const seTimeOffset = new Date(seTime.getTime() + offset * 60000)
            if (isValidDateObject(seTimeOffset) && seTimeOffset > startDate) {
                result.push({ event: se, time: seTime, timeOffset: seTimeOffset })
                solarEventsFuture.splice(index, 1)// remove that item
                index--
            }
        }
        scanDate.setDate(scanDate.getDate() + 1)
    }
    // performance.mark('SecondScanEnd');
    // performance.measure('FirstScanEnd to SecondScanEnd', 'FirstScanEnd', 'SecondScanEnd');

    // sort the results to get a timeline
    const sorted = result.sort((a, b) => {
        if (a.time < b.time) {
            return -1
        } else if (a.time > b.time) {
            return 1
        } else {
            return 0
        }
    })

    // now scan through sorted solar events to determine day/night/twilight etc
    let state = ''; const solarState = {}
    for (let index = 0; index < sorted.length; index++) {
        const event = sorted[index]
        if (event.time < startDate) {
            switch (event.event) {
            case 'nightEnd':
                state = 'Astronomical Twilight'// todo: i18n
                updateSolarState(solarState, state, 'rise', false, false, true, false, false, false, false)
                break
                // case "astronomicalDawn":
                //     state = "Astronomical Twilight";//todo: i18n
                //     updateSolarState(solarState,state,"rise",false,false,true,false,false,false,false);
                //     break;
            case 'nauticalDawn':
                state = 'Nautical Twilight'
                updateSolarState(solarState, state, 'rise', false, false, false, true, false, false, false)
                break
            case 'civilDawn':
                state = 'Civil Twilight'
                updateSolarState(solarState, state, 'rise', false, false, false, false, true, true, false)
                break
                // case "morningGoldenHourStart":
                //     updateSolarState(solarState,null,"rise",false,false,false,false,true,true,false);
                //     break;
            case 'sunrise':
                state = 'Civil Twilight'
                updateSolarState(solarState, state, 'rise', false, false, false, false, true, true, false)
                break
            case 'sunriseEnd':
                state = 'Day'
                updateSolarState(solarState, state, 'rise', true, false, false, false, false, true, false)
                break
            case 'morningGoldenHourEnd':
                state = 'Day'
                updateSolarState(solarState, state, 'rise', true, false, false, false, false, false, false)
                break
            case 'solarNoon':
                updateSolarState(solarState, null, 'fall')
                break
            case 'eveningGoldenHourStart':
                state = 'Day'
                updateSolarState(solarState, state, 'fall', true, false, false, false, false, false, true)
                break
            case 'sunsetStart':
                state = 'Day'
                updateSolarState(solarState, state, 'fall', true, false, false, false, false, false, true)
                break
            case 'sunset':
                state = 'Civil Twilight'
                updateSolarState(solarState, state, 'fall', false, false, false, false, true, false, true)
                break
                // case "eveningGoldenHourEnd":
                //     state = "Nautical Twilight";
                //     updateSolarState(solarState,state,"fall",false,false,false,false,true,false,false);
                //     break;
            case 'civilDusk':
                state = 'Nautical Twilight'
                updateSolarState(solarState, state, 'fall', false, false, false, true, false, false, false)
                break
            case 'nauticalDusk':
                state = 'Astronomical Twilight'
                updateSolarState(solarState, state, 'fall', false, false, true, false, false, false, false)
                break
                // case "astronomicalDusk":
            case 'night':
            case 'nightStart':
                state = 'Night'
                updateSolarState(solarState, state, 'fall', false, true, false, false, false, false, false)
                break
            case 'nadir':
                updateSolarState(solarState, null, 'rise')
                break
            }
        } else {
            break
        }
    }
    // update final states
    updateSolarState(solarState)// only sending `stateObject` makes updateSolarState() compute dawn/dusk etc

    // now filter to only events of interest
    const futureEvents = sorted.filter((e) => e && e.timeOffset >= startDate)
    const wantedFutureEvents = []
    for (let index = 0; index < futureEvents.length; index++) {
        const fe = futureEvents[index]
        if (solarEventsArr.includes(fe.event)) {
            wantedFutureEvents.push(fe)
        }
    }
    const nextType = wantedFutureEvents[0].event
    const nextTime = wantedFutureEvents[0].time
    const nextTimeOffset = wantedFutureEvents[0].timeOffset
    // performance.mark('End')
    // performance.measure('SecondScanEnd to End', 'SecondScanEnd', 'End')
    // performance.measure('Start to End', 'Start', 'End')

    return {
        solarState,
        nextEvent: nextType,
        nextEventTime: nextTime,
        nextEventTimeOffset: nextTimeOffset,
        eventTimes: wantedFutureEvents
        // allTimes: sorted,
        // eventTimesByType: resultCategories
    }

    function updateSolarState (stateObject, state, direction, day, night,
        astrologicalTwilight, nauticalTwilight, civilTwilight,
        morningGoldenHour, eveningGoldenHour) {
        if (arguments.length > 1) {
            if (state) stateObject.state = state
            stateObject.direction = direction
            if (arguments.length > 3) {
                stateObject.day = day
                stateObject.night = night
                stateObject.astrologicalTwilight = astrologicalTwilight
                stateObject.nauticalTwilight = nauticalTwilight
                stateObject.civilTwilight = civilTwilight
                stateObject.goldenHour = morningGoldenHour || eveningGoldenHour
                stateObject.twilight = stateObject.astrologicalTwilight || stateObject.nauticalTwilight || stateObject.civilTwilight
            }
            return
        }
        stateObject.morningTwilight = stateObject.direction === 'rise' && stateObject.twilight
        stateObject.eveningTwilight = stateObject.direction === 'fall' && stateObject.twilight
        stateObject.dawn = stateObject.direction === 'rise' && stateObject.civilTwilight
        stateObject.dusk = stateObject.direction === 'fall' && stateObject.civilTwilight
        stateObject.morningGoldenHour = stateObject.direction === 'rise' && stateObject.goldenHour
        stateObject.eveningGoldenHour = stateObject.direction === 'fall' && stateObject.goldenHour
    }
}

function exportSchedule (schedule) {
    const { active, nextDate, nextDescription, nextUTC, nextEndDate, nextEndDescription, nextEndUTC, currentStartTime, nextDates, ...rest } = schedule
    return { ...rest }
}

function exportTask (task, includeStatus) {
    const o = {
        topic: task.node_topic || task.name,
        name: task.name || task.node_topic,
        // index: task.node_index,
        payloadType: task.node_payloadType,
        payload: task.node_payload,
        limit: task.node_limit || null,
        expressionType: task.node_expressionType,
        ...(task?.node_opt?.schedule && { schedule: exportSchedule(task.node_opt.schedule) }),
        ...(task?.node_opt?.endSchedule && { endSchedule: task.node_opt.endSchedule }),
        ...(task?.node_opt?.scheduleName && { scheduleName: task.node_opt.scheduleName }),
        ...(task?.node_opt?.solarTimespanSchedule && { solarTimespanSchedule: task.node_opt.solarTimespanSchedule }),
        ...(task?.node_opt?.solarEventStart && { solarEventStart: task.node_opt.solarEventStart })
    }

    if (o.expressionType === 'solar') {
        o.solarType = task.node_solarType
        o.solarEvents = task.node_solarEvents
        o.location = task.node_location
        o.offset = task.node_offset
    } else {
        o.expression = task.node_expression
    }

    if (includeStatus) {
        o.isDynamic = task.isDynamic === true
        o.modified = task.node_modified === true
        o.isRunning = task.isRunning === true
        o.count = task.node_count
    }

    return o
}

function isTaskFinished (_task) {
    if (!_task) return true
    return _task.node_limit ? _task.node_count >= _task.node_limit : false
}

function getTaskStatus (node, task, opts, getNextDates = false) {
    opts = opts || {}
    opts.locationType = node.defaultLocationType
    opts.defaultLocation = node.defaultLocation
    opts.defaultLocationType = node.defaultLocationType
    const sol = task.node_expressionType === 'solar'
    const exp = sol ? task.node_location : task.node_expression
    const h = _describeExpression(exp, task.node_expressionType, node.timeZone, task.node_offset, task.node_solarType, task.node_solarEvents, null, opts, node.use24HourFormat)
    let nextDescription = null
    let nextDate = null
    const running = !isTaskFinished(task)
    if (running) {
        // nextDescription = h.nextDescription;
        nextDescription = h.prettyNext
        nextDate = sol ? h.nextEventTimeOffset : h.nextDate
    }
    let tz = node.timeZone
    let localTZ = ''
    try {
        localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!tz) tz = localTZ
        // eslint-disable-next-line no-empty
    } catch (error) { }

    const r = {
        type: task.isDynamic ? 'dynamic' : 'static',
        modified: !!task.modified,
        isRunning: running && task.isRunning,
        count: task.node_count,
        limit: task.node_limit,
        nextDescription,
        nextDate: running ? nextDate : null,
        nextDateTZ: running ? formatShortDateTimeWithTZ(nextDate, tz, node.use24HourFormat) : null,
        timeZone: tz,
        serverTime: new Date(),
        serverTimeZone: localTZ,
        description: h.description
    }
    if (getNextDates && h.nextDates && h.nextDates.length) {
        r.nextDates = h.nextDates.map(dateString => {
            const date = new Date(dateString)
            return formatShortDateTimeWithTZ(date, node.timeZone, node.use24HourFormat)
        })
    }
    if (sol) {
        r.solarState = h.solarState
        if (h.offset) r.solarStateOffset = h.solarStateOffset
        r.solarTimes = running ? h.eventTimes : null
        r.nextDescription = running ? nextDescription : null// r.solarTimes && (r.solarTimes[0].event + " " + r.nextDescription);
    }
    return r
}

function getNextStatus (node, task, getNextDates = false) {
    if (task && task.isRunning) {
        const status = getTaskStatus(node, task, { includeSolarStateOffset: true }, getNextDates)
        const nextDate = status.nextDateTZ
        const nextUTC = status.nextDate
        let nextDescription = status.nextDescription
        const nextDates = status.nextDates

        if (!nextDescription) {
            const result = { nextDate, nextDescription: 'Never', nextUTC, nextDates }
            return result
        }

        if (task.node_expressionType === 'solar') {
            const words = nextDescription.split(' ')

            for (let i = 0; i < words.length; i++) {
                if (PERMITTED_SOLAR_EVENTS.includes(words[i])) {
                    words[i] = mapSolarEvent(words[i])
                }
            }

            nextDescription = words.join(' ')
        }

        const result = { nextDate, nextDescription, nextUTC, nextDates }
        return result
    } else {
        const result = { nextDate: 'Never', nextDescription: 'Never', nextUTC: null, nextDates: [] }
        return result
    }
}

let sendStateTask

let userDir = ''
let persistPath = ''
let FSAvailable = false
let contextAvailable = false
const schedulerDir = 'schedulerdata'

module.exports = function (RED) {
    const STORE_NAMES = getStoreNames()
    // when running tests, RED.settings.userDir & RED.settings.settingsFile (amongst others) are undefined
    const testMode = typeof RED.settings.userDir === 'undefined' && typeof RED.settings.settingsFile === 'undefined'
    if (testMode) {
        FSAvailable = false
        contextAvailable = false
    } else {
        userDir = RED.settings.userDir || ''
        persistPath = path.join(userDir, schedulerDir)
        try {
            if (!fs.existsSync(persistPath)) {
                fs.mkdirSync(persistPath)
            }
            FSAvailable = fs.existsSync(persistPath)
        } catch (e) {
            if (e.code !== 'EEXIST') {
                RED.log.error(`scheduler: Error creating persistence folder '${persistPath}'. ${e.message}`)
                FSAvailable = false
            }
        }
        contextAvailable = STORE_NAMES.length > 2 // 1st 2 are 'none' and 'local_file_system', any others are context stores
    }

    // #region Node-RED
    function SchedulerNode (config) {
        RED.nodes.createNode(this, config)
        const node = this
        const group = RED.nodes.getNode(config.group)
        const base = group.getBase()
        node.payloadType = config.payloadType || config.type || 'default'
        // delete config.type
        node.payload = config.payload
        node.crontab = config.crontab
        node.outputField = config.outputField || 'payload'
        node.timeZone = config.timeZone
        node.use24HourFormat = config.use24HourFormat

        node.options = config.options
        node.commandResponseMsgOutput = config.commandResponseMsgOutput || 'output1'
        node.defaultLocation = config.defaultLocation
        node.defaultLocationType = config.defaultLocationType
        node.outputs = config.outputs || 1
        node.sendStateInterval = config.sendStateInterval
        node.sendActiveState = config.sendActiveState
        node.sendInactiveState = config.sendInactiveState
        node.topics = config.topics || ['Topic 1']
        node.customPayloads = config.customPayloads || []
        node.fanOut = false

        node.queuedSerialisationRequest = null
        node.serialisationRequestBusy = null
        node.postponeSerialisation = true

        setInterval(async function () {
            if (node.serialisationRequestBusy) return
            if (node.queuedSerialisationRequest) {
                node.serialisationRequestBusy = node.queuedSerialisationRequest
                await serialise()
                node.queuedSerialisationRequest = null
                node.serialisationRequestBusy = null
            }
        }, 2500) // 2.5 seconds

        const hasStoreNameProperty = Object.prototype.hasOwnProperty.call(config, 'storeName') && typeof config.storeName === 'string'
        if (hasStoreNameProperty) {
            // not an upgrade - let use this property
            node.storeName = config.storeName
        } else {
            // default
            node.storeName = 'NONE'
        }

        if (node.storeName && node.storeName !== 'local_file_system' && STORE_NAMES.indexOf(node.storeName) < 0) {
            node.warn(`Invalid store name specified '${node.storeName}' - state will not be persisted for this node`)
            contextAvailable = false
        }

        if (config.commandResponseMsgOutput === 'output2') {
            node.outputs = 2 // 1 output pins (all messages), 2 outputs (schedules out of pin1, command responses out of pin2)
        } else if (config.commandResponseMsgOutput === 'fanOut') {
            node.outputs = 1 + (node.topics ? node.topics.length : 0)
            node.fanOut = true
        } else {
            config.commandResponseMsgOutput = 'output1'
        }
        node.statusUpdatePending = false

        const MAX_CLOCK_DIFF = Number(RED.settings.scheduler_MAX_CLOCK_DIFF || process.env.scheduler_MAX_CLOCK_DIFF || 5000)
        const clockMonitor = setInterval(async function timeChecker () {
            const oldTime = timeChecker.oldTime || new Date()
            const newTime = new Date()
            const timeDiff = newTime - oldTime
            timeChecker.oldTime = newTime
            if (Math.abs(timeDiff) >= MAX_CLOCK_DIFF) {
                node.log('System Time Change Detected - refreshing schedules! If the system time was not changed then this typically occurs due to blocking code elsewhere in your application')
                await refreshTasks(node)
            }
        }, 1000)

        const setProperty = function (msg, field, value) {
            const set = (obj, path, val) => {
                const keys = path.split('.')
                const lastKey = keys.pop()
                // eslint-disable-next-line no-return-assign
                const lastObj = keys.reduce((obj, key) =>
                    obj[key] = obj[key] || {},
                obj)
                lastObj[lastKey] = val
            }
            set(msg, field, value)
        }
        const updateNodeNextInfo = (node, now) => {
            const t = getNextTask(node.tasks)
            if (t) {
                const indicator = t.isDynamic ? 'ring' : 'dot'
                const nx = (t._expression || t._sequence)
                node.nextDate = nx.nextDate(now)
                node.nextEvent = t.name
                node.nextIndicator = indicator
                if (t.node_solarEventTimes && t.node_solarEventTimes.nextEvent) {
                    node.nextEvent = t.node_solarEventTimes.nextEvent
                }
            } else {
                node.nextDate = null
                node.nextEvent = ''
                node.nextIndicator = ''
            }
        }

        function generateSolarDescription (node, cmd) {
            applyOptionDefaults(node, cmd) // Ensuring defaults are applied
            const description = _describeExpression(
                cmd.location, cmd.expressionType, cmd.timeZone || node.timeZone, cmd.offset,
                cmd.solarType, cmd.solarEvents, cmd.time, cmd, node.use24HourFormat
            ).description
            const words = description.replace(/['"]/g, '').replace(',', '').split(' ')
            for (let i = 0; i < words.length; i++) {
                if (PERMITTED_SOLAR_EVENTS.includes(words[i])) {
                    words[i] = mapSolarEvent(words[i])
                    if (i < words.length - 1) {
                        words[i] += ', '
                    }
                }
            }
            return words.join('')
        }

        // Need to improve this to handle more schedule types
        function generateScheduleObject (task) {
            function convertStringBoolean (value) {
                if (typeof value === 'string') {
                    if (value.toLowerCase() === 'true') return true
                    if (value.toLowerCase() === 'false') return false
                }
                return value
            }
            if (task.node_expressionType === 'cron') {
                const schedule = {
                    name: task.name,
                    enabled: task.node_opt.dontStartTheTask || true,
                    topic: task.node_topic,
                    scheduleType: 'cron',
                    startCronExpression: task.node_expression,
                    payloadValue: convertStringBoolean(task.node_payload),
                    description: _describeExpression(
                        task.node_opt.expression,
                        task.node_opt.expressionType,
                        task.node_opt.timeZone || node.timeZone,
                        task.node_opt.offset,
                        task.node_opt.solarType,
                        task.node_opt.solarEvents,
                        task.node_opt.time,
                        task.node_opt,
                        node.use24HourFormat
                    ).description,
                    ...(task.isStatic && { isStatic: true }) // Conditionally add isStatic
                }
                // const cronParts = task.node_expression.split(' ')
                // if (cronParts.length < 5 || cronParts.length > 7) {
                //     console.log('Invalid cron expression.', task.node_expression, cronParts)
                //     return null
                // }

                // // eslint-disable-next-line no-unused-vars
                // const [second, minute, hour, dayOfMonth, month, dayOfWeek, year] = cronParts.length === 7
                //     ? cronParts
                //     : cronParts.length === 6
                //         ? cronParts
                //         : ['', ...cronParts]

                // const daysMap = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' }
                // const daysOfWeekNumbersMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' }

                // if (second.includes('/') || minute.includes('/') || hour.includes('/') || dayOfMonth.includes('/') || month.includes('/') || dayOfWeek.includes('/')) {
                //     // Handle interval-based schedules
                //     const interval = second.includes('/')
                //         ? second.split('/')[1]
                //         : minute.includes('/')
                //             ? minute.split('/')[1]
                //             : hour.includes('/')
                //                 ? hour.split('/')[1]
                //                 : dayOfMonth.includes('/')
                //                     ? dayOfMonth.split('/')[1]
                //                     : month.includes('/')
                //                         ? month.split('/')[1]
                //                         : dayOfWeek.split('/')[1]

                //     if (minute === '0' && hour.includes('/')) {
                //         schedule.period = 'hourly'
                //         schedule.hourlyInterval = parseInt(interval, 10)
                //     } else if (minute.includes('/')) {
                //         schedule.period = 'minutes'
                //         schedule.minutesInterval = parseInt(interval, 10)
                //     } else if (second.includes('/')) {
                //         schedule.period = 'seconds'
                //         schedule.secondsInterval = parseInt(interval, 10)
                //         schedule.readonly = true
                //     } else if (dayOfMonth.includes('/')) {
                //         schedule.period = 'monthly'
                //         schedule.days = Array.from({ length: 31 }, (_, i) => i + 1).filter(day => day % parseInt(interval, 10) === 0)
                //     } else if (month.includes('/')) {
                //         schedule.period = 'yearly'
                //         schedule.months = Array.from({ length: 12 }, (_, i) => i + 1).filter(month => month % parseInt(interval, 10) === 0)
                //     } else if (dayOfWeek.includes('/')) {
                //         schedule.period = 'weekly'
                //         schedule.days = dayOfWeek.split('/').map(day => {
                //             return isNaN(day) ? daysMap[day] : daysOfWeekNumbersMap[day]
                //         })
                //     }
                // } else if (dayOfWeek.includes('-')) {
                //     // Handle day-of-week ranges
                //     const [startDay, endDay] = dayOfWeek.split('-').map(day => {
                //         return isNaN(day) ? daysMap[day] : daysOfWeekNumbersMap[day]
                //     })
                //     schedule.period = 'weekly'
                //     schedule.time = `${hour}:${minute}`
                //     schedule.days = Array.from(
                //         { length: 7 },
                //         (_, i) => daysOfWeekNumbersMap[(Object.keys(daysOfWeekNumbersMap).indexOf(startDay) + i) % 7]
                //     ).slice(0, endDay - startDay + 1)
                // } else if (dayOfWeek !== '*') {
                //     // Handle specific day-of-week schedules
                //     schedule.period = 'weekly'
                //     schedule.time = `${hour}:${minute}`
                //     schedule.days = dayOfWeek.split(',').map(day => {
                //         return isNaN(day) ? daysMap[day] : daysOfWeekNumbersMap[day]
                //     })
                // } else if (dayOfMonth !== '*' && month !== '*') {
                //     // Handle specific dates
                //     schedule.period = 'yearly'
                //     schedule.time = `${hour}:${minute}`
                //     schedule.days = dayOfMonth.split(',').map(Number)
                //     schedule.month = month
                // } else if (dayOfMonth !== '*') {
                //     // Handle monthly schedules
                //     schedule.period = 'monthly'
                //     schedule.time = `${hour}:${minute}`
                //     schedule.days = dayOfMonth.split(',').map(Number)
                // } else if (hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
                //     // Handle daily schedules
                //     schedule.period = 'daily'
                //     schedule.time = `${hour}:${minute}`
                // } else if (second === '*' && minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
                //     // Handle secondly schedules
                //     schedule.period = 'secondly'
                //     schedule.readonly = true
                // } else if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
                //     // Handle minutes schedules
                //     schedule.period = 'minutes'
                // } else if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
                //     // Handle hourly schedules
                //     schedule.period = 'hourly'
                // } else {
                //     // Custom schedules
                //     schedule.period = 'custom'
                // }

                return schedule
            } else if (task.node_expressionType === 'solar') {
                const schedule = {
                    name: task.name,
                    enabled: task.node_opt.isRunning || true,
                    topic: task.node_topic,
                    scheduleType: 'solar',
                    solarEvent: task.node_solarEvents,
                    offset: task.node_offset,
                    description: generateSolarDescription(node, task.node_opt),
                    ...(task.isStatic && { isStatic: true }) // Conditionally add isStatic
                }
                return schedule
            }
            return null
        }

        const updateDoneStatus = (node, task) => {
            let indicator = 'dot'
            if (task) {
                indicator = node.nextIndicator || 'dot'
            }
            node.status({ fill: 'green', shape: indicator, text: 'Done: ' + formatShortDateTimeWithTZ(Date.now(), node.timeZone, node.use24HourFormat) })
            // node.nextDate = getNextTask(node.tasks);
            const now = new Date()
            updateNodeNextInfo(node, now)
            const next = node.nextDate ? new Date(node.nextDate).valueOf() : (Date.now() + 5001)
            const msTillNext = next - now
            if (msTillNext > 5000) {
                node.statusUpdatePending = true
                setTimeout(function () {
                    node.statusUpdatePending = false
                    updateNextStatus(node, true)
                }, 4000)
            }
        }
        const sendMsg = async (node, task, cronTimestamp, manualTrigger, intervalTrigger = false) => {
            const msg = { scheduler: {} }
            msg.topic = task.node_topic
            msg.scheduler.triggerTimestamp = cronTimestamp
            const se = task.node_expressionType === 'solar' ? node.nextEvent : ''
            msg.scheduler.status = getTaskStatus(node, task, { includeSolarStateOffset: true })
            if (se) msg.scheduler.status.solarEvent = se
            msg.scheduler.config = exportTask(task)
            if (manualTrigger) msg.manualTrigger = true
            if (intervalTrigger) msg.intervalTrigger = true
            msg.scheduledEvent = !msg.manualTrigger
            const taskType = task.isDynamic ? 'dynamic' : 'static'

            // const index = task.node_index || 0
            const index = node.topics.findIndex(topic => topic === task.node_topic)

            if (index === -1) {
                // Handle the case where the topic is not found
                node.error(`Topic "${task.node_topic}" not found for ${task.name}`)
            }

            if (!intervalTrigger) {
                const indicator = node.nextIndicator || 'dot'
                node.status({ fill: 'green', shape: indicator, text: 'Schedule Started' })
            }
            try {
                if (task.node_payloadType !== 'flow' && task.node_payloadType !== 'global') {
                    let pl
                    if ((task.node_payloadType == null && task.node_payload === '') || task.node_payloadType === 'date') {
                        pl = Date.now()
                    } else if (task.node_payloadType == null) {
                        pl = task.node_payload
                    } else if (task.node_payloadType === 'none') {
                        pl = ''
                    } else if (task.node_payloadType === 'json' && isObject(task.node_payload)) {
                        pl = task.node_payload
                    } else if (task.node_payloadType === 'bin' && Array.isArray(task.node_payload)) {
                        pl = Buffer.from(task.node_payload)
                    } else if (task.node_payloadType === 'custom' && task.node_payload) {
                        const customPayload = node.customPayloads.find(payload => payload.id === task.node_payload)
                        pl = customPayload ? customPayload.value : ''
                    } else if (task.node_payloadType === 'default') {
                        pl = msg.scheduler
                        delete msg.scheduler // To delete or not?
                    } else {
                        pl = await evaluateNodeProperty(task.node_payload, task.node_payloadType, node, msg)
                    }
                    setProperty(msg, node.outputField, pl)
                    node.send(generateSendMsg(node, msg, taskType, index))
                    if (!intervalTrigger) { updateDoneStatus(node, task) }
                } else {
                    const res = await evaluateNodeProperty(task.node_payload, task.node_payloadType, node, msg)
                    setProperty(msg, node.outputField, res)
                    node.send(generateSendMsg(node, msg, taskType, index))
                    if (!intervalTrigger) { updateDoneStatus(node, task) }
                }
            } catch (err) {
                node.error(err, msg)
            }
        }

        /**
         * Sends messages for active or inactive tasks based on the provided topics and node schedules.
         *
         * @param {Object} node - The node object containing schedules and configuration for message sending.
         * @param {number} timestamp - The timestamp to include in the message.
         * @param {Array} [topics=[]] - An optional array of topics to filter which tasks to process.
         *
         * Iterates through the node's schedules to determine active and inactive tasks for the specified topics.
         * Sends messages for tasks that are currently running and match the active state configuration of the node.
         */
        function sendTopicMsg (node, timestamp, topics = []) {
            const schedules = node.schedules || []
            const topicTasks = {}

            // Iterate through schedules to collect topics and tasks
            schedules.forEach((schedule) => {
                if (schedule && (schedule.timespan !== false)) {
                    const isActive = schedule.active
                    let task = null

                    if (topics.includes(schedule.topic) || topics.length === 0) {
                        if (isActive && (!topicTasks[schedule.topic] || !topicTasks[schedule.topic].active)) {
                            task = schedule.primaryTask?.task
                            if (task && task.isRunning) {
                                topicTasks[schedule.topic] = { task, active: true }
                            }
                        } else if (!isActive && !topicTasks[schedule.topic]) {
                            task = schedule.endTask?.task
                            if (task && task.isRunning) {
                                topicTasks[schedule.topic] = { task, active: false }
                            }
                        }
                    }
                }
            })

            // Iterate through topics to send messages
            Object.keys(topicTasks).forEach((topic) => {
                const taskData = topicTasks[topic]
                if (taskData) {
                    const { task, active } = taskData
                    if (active && node.sendActiveState) {
                        sendMsg(node, task, timestamp, false, true)
                    } else if (!active && node.sendInactiveState) {
                        sendMsg(node, task, timestamp, false, true)
                    }
                }
            })
        }

        (async function () {
            let sendStateTask = null
            try {
                node.status({})
                node.nextDate = null

                if (!node.options) {
                    node.status({ fill: 'grey', shape: 'dot', text: 'Nothing set' })
                    return
                }

                node.tasks = []
                base.stores.state.set(base, node, null, 'schedules', [])
                for (let iOpt = 0; iOpt < node.options.length; iOpt++) {
                    const opt = node.options[iOpt]
                    opt.name = opt.name || opt.topic
                    node.statusUpdatePending = true// prevent unnecessary status updates while loading
                    await createTask(node, opt, iOpt, true)
                }

                // now load dynamic schedules from file
                await deserialise()

                setTimeout(() => {
                    updateNextStatus(node, true)
                }, 200)
                if (node.sendActiveState || node.sendInactiveState) {
                    const seconds = Number(node.sendStateInterval) || 60
                    const expression = cronosjs.CronosExpression.parse(`*/${seconds} * * * * *`)
                    if (sendStateTask) {
                        _deleteTask(sendStateTask)
                    }
                    sendStateTask = new cronosjs.CronosTask(expression)
                    sendStateTask
                        .on('run', (timestamp) => {
                            sendTopicMsg(node, timestamp)
                        })
                        .start()
                }
                node.postponeSerialisation = false
            } catch (err) {
                if (node.tasks) {
                    node.tasks.forEach(task => task.stop())
                }
                node.status({ fill: 'red', shape: 'dot', text: 'Error creating schedule' })
                node.error(err)
            }
        })()

        node.on('close', async function (done) {
            try {
                await serialise()
            } catch (error) {
                node.error(error)
            }
            node.postponeSerialisation = true
            deleteAllTasks(this)
            if (clockMonitor) clearInterval(clockMonitor)
            if (done && typeof done === 'function') done()
        })

        this.on('input', async function (msg, send, done) {
            send = send || function () { node.send.apply(node, arguments) }
            done = done || function (err) {
                if (err) {
                    node.error(err, msg)
                }
            }
            // is this an button press?...
            if (!msg.payload && !msg.topic) { // TODO: better method of differentiating between bad input and button press
                await sendMsg(node, node.tasks[0], Date.now(), true)
                done()
                return
            }

            const controlTopic = controlTopics.find(ct => ct.command === msg.topic)
            let payload = msg.payload
            if (controlTopic) {
                if (controlTopic.payloadIsName) {
                    if (!payload || typeof payload !== 'string') {
                        node.error(`Invalid payload! Control topic '${msg.topic}' expects the name of the schedule to be in msg.payload`, msg)
                        return
                    }
                    // emulate the cmd object
                    payload = {
                        command: controlTopic.command,
                        name: payload
                    }
                } else {
                    payload = {
                        command: controlTopic.command,
                        ...payload
                    }
                }
            }

            if (typeof payload !== 'object') {
                return
            }

            try {
                let input = payload
                if (Array.isArray(payload) === false) {
                    input = [input]
                }
                const sendCommandResponse = function (msg) {
                    send(generateSendMsg(node, msg, 'command-response'))
                }
                for (let i = 0; i < input.length; i++) {
                    const cmd = input[i]
                    const action = cmd.command || ''
                    // let newMsg = {topic: msg.topic, payload:{command:cmd, result:{}}};
                    const newMsg = RED.util.cloneMessage(msg)
                    newMsg.payload = { command: cmd, result: {} }
                    const cmdAll = action.endsWith('-all')
                    const cmdAllStatic = action.endsWith('-all-static')
                    const cmdAllDynamic = action.endsWith('-all-dynamic')
                    const cmdTopic = action.endsWith('-topic')
                    const cmdActive = action.endsWith('-active')
                    const cmdInactive = action.endsWith('-inactive')
                    const cmdActiveDynamic = action.includes('-active-dynamic')
                    const cmdActiveStatic = action.includes('-active-static')
                    const cmdInactiveDynamic = action.includes('-inactive-dynamic')
                    const cmdInactiveStatic = action.includes('-inactive-static')

                    let cmdFilter = null
                    const actionParts = action.split('-')
                    let mainAction = actionParts[0]
                    if (actionParts.length > 1) mainAction += '-'

                    if (cmdAllDynamic) {
                        cmdFilter = {}
                        cmdFilter.type = 'dynamic'
                    } else if (cmdAllStatic) {
                        cmdFilter = {}
                        cmdFilter.type = 'static'
                    } else if (cmdTopic) {
                        cmdFilter = {}
                        cmdFilter.type = 'topic'
                    } else if (cmdActive) {
                        cmdFilter = {}
                        cmdFilter.type = 'active'
                    } else if (cmdInactive) {
                        cmdFilter = {}
                        cmdFilter.type = 'inactive'
                    } else if (cmdActiveDynamic) {
                        cmdFilter = {}
                        cmdFilter.type = 'active-dynamic'
                    } else if (cmdActiveStatic) {
                        cmdFilter = {}
                        cmdFilter.type = 'active-static'
                    } else if (cmdInactiveDynamic) {
                        cmdFilter = {}
                        cmdFilter.type = 'inactive-dynamic'
                    } else if (cmdInactiveStatic) {
                        cmdFilter = {}
                        cmdFilter.type = 'inactive-static'
                    }
                    if (cmd.topic && cmd.topic !== '') {
                        if (!cmdFilter) cmdFilter = {}
                        cmdFilter.topic = cmd.topic
                    }

                    switch (mainAction) {
                    case 'trigger': // single
                        {
                            const schedule = getScheduleByName(node, cmd.name)
                            if (!schedule) throw new Error(`Manual Trigger failed. Cannot find schedule named '${cmd.name}'`)
                            const primaryTask = schedule?.primaryTask?.task
                            if (primaryTask) {
                                sendMsg(node, primaryTask, Date.now(), true)
                            }
                        }
                        break
                    case 'trigger-': // multiple
                        if (node.schedules) {
                            node.schedules.forEach(schedule => {
                                if (schedule && (cmdAll || scheduleFilterMatch(schedule, cmdFilter))) {
                                    const primaryTask = schedule?.primaryTask?.task
                                    if (primaryTask) {
                                        sendMsg(node, primaryTask, Date.now(), true)
                                    }
                                }
                            })
                        }
                        break
                    case 'describe': // single
                        {
                            const exp = (cmd.expressionType === 'solar') ? cmd.location : cmd.expression
                            applyOptionDefaults(node, cmd)
                            newMsg.payload.result = _describeExpression(exp, cmd.expressionType, cmd.timeZone || node.timeZone, cmd.offset, cmd.solarType, cmd.solarEvents, cmd.time, { includeSolarStateOffset: true, locationType: node.node_locationType }, node.use24HourFormat)
                            sendCommandResponse(newMsg)
                        }
                        break
                    case 'status': // single
                        {
                            const schedule = getScheduleByName(node, cmd.name)
                            if (schedule) {
                                newMsg.payload.result.config = exportSchedule(schedule)
                                newMsg.payload.result.status = getScheduleStatus(node, schedule, true)
                            } else {
                                newMsg.error = `${cmd.name} not found`
                            }
                            sendCommandResponse(newMsg)
                        }
                        updateNextStatus(node, true)
                        break
                    case 'export': // single
                        {
                            const task = getTask(node, cmd.name)
                            if (task) {
                                newMsg.payload.result = exportTask(task, false)
                            } else {
                                newMsg.error = `${cmd.name} not found`
                            }
                            sendCommandResponse(newMsg)
                        }
                        break
                    case 'list-': // multiple
                    case 'status-': // multiple
                        {
                            const results = []
                            if (node.tasks) {
                                for (let index = 0; index < node.tasks.length; index++) {
                                    const task = node.tasks[index]
                                    if (task && (cmdAll || taskFilterMatch(task, cmdFilter))) {
                                        const result = {}
                                        result.config = exportTask(task, true)
                                        result.status = getTaskStatus(node, task, { includeSolarStateOffset: true })
                                        results.push(result)
                                    }
                                }
                            }
                            newMsg.payload.result = results
                            sendCommandResponse(newMsg)
                        }
                        break
                    case 'export-': // multiple
                        {
                            const results = []
                            if (node.tasks) {
                                for (let index = 0; index < node.tasks.length; index++) {
                                    const task = node.tasks[index]
                                    if (cmdAll || taskFilterMatch(task, cmdFilter)) {
                                        results.push(exportTask(task, false))
                                    }
                                }
                            }
                            newMsg.payload.result = results
                            sendCommandResponse(newMsg)
                        }
                        break
                    case 'add': // single
                    case 'update': // single
                        await updateTask(node, cmd, msg)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'clear':
                    case 'remove-': // multiple
                    case 'delete-': // multiple
                        deleteAllTasks(node, cmdFilter)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'remove': // single
                    case 'delete': // single
                        deleteTask(node, cmd.name)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'start': // single
                        startTask(node, cmd.name)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'start-': // multiple
                        startAllTasks(node, cmdFilter)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'stop': // single
                    case 'pause': // single
                        stopTask(node, cmd.name, cmd.command === 'stop')
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                        break
                    case 'stop-': // multiple
                    case 'pause-': {
                        const resetCounter = cmd.command.startsWith('stop-')
                        stopAllTasks(node, resetCounter, cmdFilter)
                        updateNextStatus(node, true)
                        requestSerialisation()// update persistence
                    }
                        break
                    case 'next':
                        if (node.tasks && node.tasks.length) {
                            // gather statuses
                            const statuses = []
                            for (let index = 0; index < node.tasks.length; index++) {
                                const task = node.tasks[index]
                                const result = {}
                                result.config = exportTask(task, true)
                                result.status = getTaskStatus(node, task, { includeSolarStateOffset: true })
                                statuses.push(result)
                            }
                            const next = statuses.length && statuses.reduce((a, b) => a.status.nextDate < b.status.nextDate ? a : b)
                            if (next) {
                                newMsg.payload = {
                                    name: next.config.name,
                                    topic: next.config.topic,
                                    next: next.status.nextDate,
                                    nextLocal: next.status.nextDateTZ,
                                    timeZone: next.status.serverTimeZone,
                                    when: next.status.description,
                                    msUntil: next.status.nextDate.valueOf() - next.status.serverTime.valueOf(),
                                    description: next.status.nextDescription
                                }
                            } else {
                                newMsg.payload = {}
                            }
                        } else {
                            newMsg.payload = {}
                        }
                        sendCommandResponse(newMsg)
                        break
                    case 'debug': {
                        const task = getTask(node, cmd.name)
                        const thisDebug = getTaskStatus(node, task, { includeSolarStateOffset: true })
                        thisDebug.name = task.name
                        thisDebug.topic = task.node_topic
                        thisDebug.expressionType = task.node_expressionType
                        thisDebug.expression = task.node_expression
                        thisDebug.location = task.node_location
                        thisDebug.offset = task.node_offset
                        thisDebug.solarType = task.node_solarType
                        thisDebug.solarEvents = task.node_solarEvents
                        newMsg.payload = thisDebug
                        sendCommandResponse(newMsg)
                    }
                        break
                    case 'debug-': { // multiple
                        const results = []
                        if (node.tasks) {
                            for (let index = 0; index < node.tasks.length; index++) {
                                const task = node.tasks[index]
                                if (cmdAll || taskFilterMatch(task, cmdFilter)) {
                                    const thisDebug = getTaskStatus(node, task, { includeSolarStateOffset: true })
                                    thisDebug.name = task.name
                                    thisDebug.topic = task.node_topic
                                    thisDebug.expressionType = task.node_expressionType
                                    thisDebug.expression = task.node_expression
                                    thisDebug.location = task.node_location
                                    thisDebug.offset = task.node_offset
                                    thisDebug.solarType = task.node_solarType
                                    thisDebug.solarEvents = task.node_solarEvents
                                    results.push(thisDebug)
                                }
                            }
                        }
                        newMsg.payload = results
                        sendCommandResponse(newMsg)
                    }
                        break
                    }
                }
            } catch (error) {
                done(error)
                // node.error(error,msg);
            }
        })

        function getTask (node, name) {
            const task = node.tasks.find(function (task) {
                return task.name === name
            })
            return task
        }
        async function refreshTasks (node) {
            const tasks = node.tasks
            node.debug('Refreshing running schedules')
            if (tasks) {
                try {
                    // let now = new Date();
                    if (!tasks || !tasks.length) { return null }
                    const tasksToRefresh = tasks.filter(function (task) {
                        return task._sequence || (task.isRunning && task._expression && !isTaskFinished(task))
                    })
                    if (!tasksToRefresh || !tasksToRefresh.length) {
                        return null
                    }
                    for (let index = 0; index < node.tasks.length; index++) {
                        const task = node.tasks[index]
                        if (task.node_expressionType === 'cron') {
                            task.stop()
                            task.start()
                        } else {
                            await updateTask(node, task.node_opt, null)
                        }
                        // task.runScheduledTasks();
                        // index--;
                    }
                } catch (e) { }
                updateNextStatus(node)
            }
        }
        function taskFilterMatch (task, filter) {
            if (!task) return false
            // eslint-disable-next-line eqeqeq
            const isActive = function (task) { return isTaskFinished(task) == false && task.isRunning == true }
            // eslint-disable-next-line eqeqeq
            const isInactive = function (task) { return isTaskFinished(task) || task.isRunning == false }
            // eslint-disable-next-line eqeqeq
            const isStatic = function (task) { return (task.isStatic == true || task.isDynamic == false) }
            // eslint-disable-next-line eqeqeq
            const isDynamic = function (task) { return (task.isDynamic == true || task.isStatic == false) }
            switch (filter) {
            case 'all':
                return true
            case 'static':
                return isStatic(task)
            case 'dynamic':
                return isDynamic(task)
            case 'active':
                return isActive(task)
            case 'inactive':
                return isInactive(task)
            case 'active-dynamic':
                return isActive(task) && isDynamic(task)
            case 'active-static':
                return isActive(task) && isStatic(task)
            case 'inactive-dynamic':
                return isInactive(task) && isDynamic(task)
            case 'inactive-static':
                return isInactive(task) && isStatic(task)
            }
            return false
        }

        /**
         * Determines if a given schedule matches a specified filter criteria.
         *
         * @param {Object} schedule - The schedule object to be evaluated.
         * @param {Object} filter - The filter criteria containing type and topic.
         * @param {string} filter.type - The type of filter to apply (e.g., 'all', 'static', 'dynamic', 'topic', 'active', 'inactive', 'active-dynamic', 'active-static', 'inactive-dynamic', 'inactive-static').
         * @param {string|null} filter.topic - The topic to match against the schedule's topic.
         * @returns {boolean} - Returns true if the schedule matches the filter criteria, otherwise false.
         */
        function scheduleFilterMatch (schedule, filter) {
            if (!schedule) return false
            const { type, topic } = filter
            const isActive = function (schedule) { return schedule.enabled === true }
            const isInactive = function (schedule) { return schedule.enabled === false }
            const isStatic = function (schedule) { return (schedule.isStatic === true || schedule.isDynamic === false) }
            const isDynamic = function (schedule) { return (schedule.isDynamic === true || schedule.isStatic === false) }
            const isTopicMatch = function (schedule, topic) { return (topic !== null && schedule.topic === topic) }

            switch (type) {
            case 'all':
                return true
            case 'static':
                return isStatic(schedule)
            case 'dynamic':
                return isDynamic(schedule)
            case 'topic':
                return isTopicMatch(schedule, topic)
            case 'active':
                return isActive(schedule)
            case 'inactive':
                return isInactive(schedule)
            case 'active-dynamic':
                return isActive(schedule) && isDynamic(schedule)
            case 'active-static':
                return isActive(schedule) && isStatic(schedule)
            case 'inactive-dynamic':
                return isInactive(schedule) && isDynamic(schedule)
            case 'inactive-static':
                return isInactive(schedule) && isStatic(schedule)
            }
            return false
        }

        function stopTask (node, name, resetCounter) {
            const task = getTask(node, name)
            if (task) {
                task.stop()
                if (resetCounter) { task.node_count = 0 }
            }
            return task
        }
        function stopAllTasks (node, resetCounter, filter) {
            if (node.tasks) {
                for (let index = 0; index < node.tasks.length; index++) {
                    const task = node.tasks[index]
                    if (task) {
                        let skip = false
                        if (filter) skip = (taskFilterMatch(task, filter) === false)
                        if (!skip) {
                            task.stop()
                            if (resetCounter) { task.node_count = 0 }
                        }
                    }
                }
            }
        }
        function startTask (node, name) {
            const task = getTask(node, name)
            if (task) {
                if (isTaskFinished(task)) {
                    task.node_count = 0
                }
                task.stop()// prevent bug where calling start without first calling stop causes events to bunch up
                task.start()
            }
            return task
        }
        function startAllTasks (node, filter) {
            if (node.tasks) {
                for (let index = 0; index < node.tasks.length; index++) {
                    const task = node.tasks[index]
                    let skip = false
                    if (filter) skip = (taskFilterMatch(task, filter) === false)
                    if (!skip && task) {
                        if (isTaskFinished(task)) {
                            task.node_count = 0
                        }
                        task.stop()// prevent bug where calling start without first calling stop causes events to bunch up
                        task.start()
                    }
                }
            }
        }
        function deleteAllTasks (node, filter) {
            if (node.tasks) {
                for (let index = 0; index < node.tasks.length; index++) {
                    try {
                        const task = node.tasks[index]
                        if (task) {
                            let skip = false
                            if (filter) skip = (taskFilterMatch(task, filter) === false)
                            if (!skip) {
                                _deleteTask(task)
                                node.tasks[index] = null
                                node.tasks.splice(index, 1)
                                index--
                            }
                        }
                        // eslint-disable-next-line no-empty
                    } catch (error) {
                        console.log('deleteAllTasks', error)
                    }
                }
            }
        }
        function deleteTask (node, name) {
            let task = getTask(node, name)
            if (task) {
                _deleteTask(task)
                node.tasks = node.tasks.filter(t => t && t.name !== name)
                task = null
            }
        }
        function _deleteTask (task) {
            try {
                task.off('run')
                task.off('ended')
                task.off('started')
                task.off('stopped')
                task.stop()
                task = null
                // eslint-disable-next-line no-empty
            } catch (error) { }
        }

        function getSchedule (node, scheduleName) {
            const schedules = base.stores.state.getProperty(node.id, 'schedules') || []
            const scheduleIndex = schedules.findIndex(schedule => schedule.name === scheduleName)
            let schedule = null
            if (scheduleIndex !== -1) {
                // Get the schedule
                schedule = schedules[scheduleIndex]
            }
            return schedule
        }
        function updateSchedule (node, scheduleName, task = null, props, emitEvent = true, eventName = 'update') {
            const schedules = base.stores.state.getProperty(node.id, 'schedules') || []
            const scheduleIndex = schedules.findIndex(schedule => schedule.name === scheduleName)
            let stateChange = false
            let schedule = null

            if (scheduleIndex !== -1) {
                // Get the schedule
                schedule = schedules[scheduleIndex]

                // Update the schedule with props
                Object.assign(schedule, props)
            } else {
                if (props && props.name) {
                    schedules.push(props)
                    schedule = props
                }
            }

            if (schedule) { // Update the schedules property
                // Remove null properties from schedule
                for (const key in schedule) {
                    if (schedule[key] === null) {
                        delete schedule[key]
                    }
                }
                stateChange = true
                base.stores.state.set(base, node, null, 'schedules', schedules)
                if (!task) {
                    task = getTask(node, scheduleName)
                }
                if (task) {
                    task.node_opt.schedule = schedule
                }
                if (emitEvent && stateChange) {
                    const m = { ui_update: { schedules }, event: eventName, schedule: scheduleName }
                    base.emit('msg-input:' + node.id, m, node)
                }
            }
            return stateChange
        }

        async function updateTask (node, options, msg) {
            if (!options || typeof options !== 'object') {
                node.warn('schedule settings are not valid', msg)
                return null
            }

            // eslint-disable-next-line eqeqeq
            if (Array.isArray(options) == false) {
                options = [options]
            }

            for (let index = 0; index < options.length; index++) {
                const opt = options[index]
                opt.payloadType = opt.payloadType || opt.type
                if (opt.payloadType == null && typeof opt.payload === 'string' && opt.payload.length) {
                    opt.payloadType = 'str'
                }
                opt.payloadType = opt.payloadType || 'default'
                delete opt.type
                try {
                    validateOpt(opt)
                } catch (error) {
                    node.warn(error, msg)
                    return
                }
            }

            for (let index = 0; index < options.length; index++) {
                const opt = options[index]
                const task = getTask(node, opt.name)
                const isDynamic = !task || task.isDynamic
                // let isStatic = task && task.isStatic;
                let opCount = 0; let modified = false
                if (task) {
                    modified = true
                    opCount = task.node_count || 0
                    deleteTask(node, opt.name)
                }
                const taskCount = node.tasks ? node.tasks.length : 0
                const taskIndex = task && node.fanOut ? (task.node_index || 0) : taskCount
                const t = await createTask(node, opt, taskIndex, !isDynamic)
                if (t) {
                    if (modified) t.node_modified = true
                    t.node_count = opCount
                    t.isDynamic = isDynamic
                }
            }
            requestSerialisation()// request persistent state be written
        }

        async function createTask (node, opt, index, _static) {
            opt = opt || {}
            try {
                node.debug(`createTask - index: ${index}, static: ${_static}, opt: ${JSON.stringify(opt)}`)
            } catch (error) {
                node.error(error)
            }
            applyOptionDefaults(node, opt, index)
            try {
                validateOpt(opt)
            } catch (error) {
                node.warn(error)
                const indicator = _static ? 'dot' : 'ring'
                node.status({ fill: 'red', shape: indicator, text: error.message })
                return null
            }
            const cronOpts = node.timeZone ? { timezone: node.timeZone } : undefined
            let task
            if (opt.expressionType === 'cron') {
                const expression = cronosjs.CronosExpression.parse(opt.expression, cronOpts)
                task = new cronosjs.CronosTask(expression)
            } else if (opt.expressionType === 'solar') {
                if (node.defaultLocationType === 'env' || node.defaultLocationType === 'fixed') {
                    opt.locationType = node.defaultLocationType
                    opt.location = await evaluateNodeProperty(node.defaultLocation, node.defaultLocationType, node)
                } else { // per schedule
                    opt.location = await evaluateNodeProperty(opt.location, 'str', node)
                }
                const ds = parseSolarTimes(opt)
                task = ds.task
                task.node_solarEventTimes = ds.solarEventTimes
            } else {
                const ds = parseDateSequence(opt.expression)
                task = ds.task
            }
            task.isDynamic = !_static
            task.isStatic = _static
            task.name = '' + opt.name
            task.node_topic = opt.topic
            task.node_expressionType = opt.expressionType
            task.node_expression = opt.expression
            task.node_payloadType = opt.payloadType
            task.node_payload = opt.payload
            task.node_count = opt.count || 0
            task.node_locationType = opt.locationType
            task.node_location = opt.location
            task.node_solarType = opt.solarType
            task.node_solarEvents = opt.solarEvents
            task.node_offset = opt.offset
            // task.node_index = index
            task.node_opt = opt
            task.node_limit = opt.limit || 0

            // generate schedule object for UI if it doesn't exist
            if (!task.node_opt.schedule && !task.node_opt.endSchedule && !task.node_opt.solarTimespanSchedule) {
                const props = generateScheduleObject(task)
                if (props) {
                    updateSchedule(node, task.name, task, props, true, 'add')
                }
            }

            task.stop()
            task.on('run', (timestamp) => {
                node.status({ fill: 'green', shape: 'dot', text: formatShortDateTimeWithTZ(timestamp, node.timeZone, node.use24HourFormat) })
                node.debug(`running '${task.name}' ~ '${task.node_topic}'\n now time ${new Date()}\n crontime ${new Date(timestamp)}`)
                const indicator = task.isDynamic ? 'ring' : 'dot'
                node.status({ fill: 'green', shape: indicator, text: 'Running ' + formatShortDateTimeWithTZ(timestamp, node.timeZone, node.use24HourFormat) })
                if (task.node_opt.schedule) {
                    if (task.node_opt.schedule.hasEndTime || task.node_opt.schedule.hasDuration) {
                        const status = getNextStatus(node, task)
                        let props = {}
                        if (task.node_opt.schedule.hasDuration === 'time' && task.node_opt.schedule.solarEventStart === false) {
                            props = {
                                nextEndDate: status.nextDate,
                                nextEndDescription: status.nextDescription,
                                nextEndUTC: status.nextUTC,
                                active: false,
                                currentStartTime: null
                            }
                        } else {
                            props = {
                                nextDate: status.nextDate,
                                nextDescription: status.nextDescription,
                                nextUTC: status.nextUTC,
                                active: true,
                                currentStartTime: new Date().toISOString()
                            }
                        }

                        updateSchedule(node, task.name, task, props, true, 'run')
                    }
                }
                if (task.node_opt.endSchedule) {
                    const status = getNextStatus(node, task)
                    const props = {
                        nextEndDate: status.nextDate,
                        nextEndDescription: status.nextDescription,
                        nextEndUTC: status.nextUTC,
                        active: false,
                        currentStartTime: null
                    }
                    updateSchedule(node, task.node_opt.scheduleName, null, props, true, 'run')
                }

                // solarTimespanSchedule
                if (task.node_opt.solarTimespanSchedule) {
                    const status = getNextStatus(node, task)
                    let props = {}

                    if (task.node_opt.solarEventStart === true) {
                        props = {
                            nextEndDate: status.nextDate,
                            nextEndDescription: status.nextDescription,
                            nextEndUTC: status.nextUTC,
                            active: false,
                            currentStartTime: null
                        }
                    } else {
                        props = {
                            nextDate: status.nextDate,
                            nextDescription: status.nextDescription,
                            nextUTC: status.nextUTC,
                            active: true,
                            currentStartTime: new Date().toISOString()
                        }
                    }

                    updateSchedule(node, task.node_opt.scheduleName, null, props, true, 'run')
                }
                if (isTaskFinished(task)) {
                    process.nextTick(function () {
                        // using nextTick is a work around for an issue (#3) in cronosjs where the job restarts itself after this event handler has exited
                        task.stop()
                        updateNextStatus(node)
                    })
                    return
                }
                task.node_count = task.node_count + 1// ++ stops at 2147483647
                sendMsg(node, task, timestamp)
                process.nextTick(async function () {
                    if (task.node_expressionType === 'solar') {
                        await updateTask(node, task.node_opt, null)
                        if (task.node_opt.schedule) {
                            if (task.node_opt.schedule.duration && task.node_opt.schedule.hasDuration === true) {
                                const duration = task.node_opt.schedule.duration * 60 * 1000 // Assuming duration is in minutes
                                const eventTime = task.node_solarEventTimes.nextEventTimeOffset

                                // Convert nextEvent to timestamp, add duration, and create new Date object
                                const newDate = new Date(new Date(eventTime).getTime() + duration)

                                // create new task
                                const endCmd = {
                                    command: 'add',
                                    name: `${task.node_opt.schedule.name}_end_sched_type`,
                                    topic: task.node_topic,
                                    expression: newDate,
                                    payload: task.node_opt.schedule?.endPayload || false,
                                    type: 'bool',
                                    dontStartTheTask: !task.node_opt.schedule.enabled,
                                    scheduleName: task.node_opt.schedule.name,
                                    endSchedule: true,
                                    noExport: true
                                }
                                await updateTask(node, endCmd, null)
                            }
                            if (task.node_opt.schedule.hasDuration === 'time' && task.node_opt.schedule.solarEventTimespanTime) {
                                const solarTimespanTask = getTask(node, `${task.node_opt.schedule.name}_end_sched_type`)
                                const status = getNextStatus(node, solarTimespanTask)
                                let props = {}
                                if (task.node_opt.schedule.solarEventStart === true) {
                                    props = {
                                        nextEndDate: status.nextDate,
                                        nextEndDescription: status.nextDescription,
                                        nextEndUTC: status.nextUTC
                                    }
                                } else {
                                    props = {
                                        nextDate: status.nextDate,
                                        nextDescription: status.nextDescription,
                                        nextUTC: status.nextUTC
                                    }
                                }
                                updateSchedule(node, task.node_opt.schedule.name, null, props, true, 'update')
                                props = {}

                                const schedule = getSchedule(node, task.node_opt.schedule.name)

                                props.duration = (new Date(schedule.nextUTC).getTime() - new Date(schedule.nextEndUTC).getTime()) / 60000
                                updateSchedule(node, task.node_opt.schedule.name, null, props, true, 'update')
                            }
                        }
                    }
                    requestSerialisation()// request persistent state be written
                })
            })
                .on('ended', () => {
                    node.debug(`ended '${task.name}' ~ '${task.node_topic}'`)
                    updateNextStatus(node)
                    requestSerialisation()// request persistent state be written
                })
                .on('started', () => {
                    // Function to validate date format
                    function isValidDate (dateString) {
                        const date = new Date(dateString)
                        return date instanceof Date && !isNaN(date)
                    }

                    node.debug(`started '${task.name}' ~ '${task.node_topic}'`)
                    process.nextTick(function () {
                        updateNextStatus(node)
                    })
                    if (task.node_opt.schedule) {
                        const status = getNextStatus(node, task)
                        let props = {}
                        if (task.node_opt.schedule.solarEventStart === false) {
                            props = {
                                enabled: true,
                                nextEndDate: status.nextDate,
                                nextEndDescription: status.nextDescription,
                                nextEndUTC: status.nextUTC
                            }
                        } else {
                            props = {
                                enabled: true,
                                nextDate: status.nextDate,
                                nextDescription: status.nextDescription,
                                nextUTC: status.nextUTC
                            }
                        }
                        if (!task.node_opt.schedule.hasDuration && !task.node_opt.schedule.hasEndTime) {
                            props.active = null
                            props.currentStartTime = null
                        }

                        updateSchedule(node, task.name, task, props, true, 'start')
                        if (task.node_expressionType === 'solar') {
                            if (task.node_opt.schedule.duration && task.node_opt.schedule.hasDuration === true) {
                                const duration = task.node_opt.schedule.duration * 60 * 1000 // Assuming duration is in minutes
                                const eventTime = task.node_solarEventTimes.nextEventTimeOffset

                                // Convert nextEvent to timestamp, add duration, and create new Date object with today's date in UTC
                                const now = new Date()
                                const todayDateUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

                                const eventTimeInMs = new Date(eventTime).getTime()
                                let newDateUTC = new Date(todayDateUTC.getTime() + eventTimeInMs % (24 * 60 * 60 * 1000) + duration)

                                // Check if newDateUTC is in the past
                                if (newDateUTC.getTime() < now.getTime()) {
                                    // If in the past, set newDateUTC to eventTime + duration
                                    newDateUTC = new Date(eventTimeInMs + duration)
                                }

                                // create new task
                                const endCmd = {
                                    command: 'add',
                                    name: `${task.node_opt.schedule.name}_end_sched_type`,
                                    topic: task.node_topic,
                                    expression: newDateUTC,
                                    payload: task.node_opt.schedule?.endPayload || false,
                                    type: 'bool',
                                    dontStartTheTask: !task.node_opt.schedule.enabled,
                                    scheduleName: task.node_opt.schedule.name,
                                    endSchedule: true,
                                    noExport: true
                                }
                                updateTask(node, endCmd, null)
                            }
                        }
                    }
                    if (task.node_opt.endSchedule) {
                        const status = getNextStatus(node, task)
                        const props = {
                            nextEndDate: status.nextDate,
                            nextEndDescription: status.nextDescription,
                            nextEndUTC: status.nextUTC
                        }

                        const schedule = getSchedule(node, task.node_opt.scheduleName)
                        if (schedule) {
                            if (isValidDate(schedule.nextUTC) && isValidDate(props.nextEndUTC)) {
                                if (new Date(schedule.nextUTC) < new Date(props.nextEndUTC)) {
                                    props.active = false
                                } else if (new Date(schedule.nextUTC) > new Date(props.nextEndUTC)) {
                                    if (new Date(props.nextEndUTC) > new Date()) {
                                        props.active = true
                                        if (schedule.duration && props.nextEndUTC) {
                                            props.currentStartTime = new Date(new Date(props.nextEndUTC).getTime() - schedule.duration * 60000).toISOString()
                                        } else {
                                            props.currentStartTime = new Date().toISOString()
                                        }
                                    } else {
                                        props.active = false
                                    }
                                } else {
                                    console.log('Next date is the same as next end date')
                                }
                            } else {
                                console.log('Invalid date format')
                            }
                        }

                        updateSchedule(node, task.node_opt.scheduleName, null, props, true, 'started')
                    }

                    if (task.node_opt.solarTimespanSchedule) {
                        const status = getNextStatus(node, task)
                        let props = {}
                        if (task.node_opt.solarEventStart === true) {
                            props = {
                                nextEndDate: status.nextDate,
                                nextEndDescription: status.nextDescription,
                                nextEndUTC: status.nextUTC
                            }
                        } else {
                            props = {
                                nextDate: status.nextDate,
                                nextDescription: status.nextDescription,
                                nextUTC: status.nextUTC
                            }
                        }
                        updateSchedule(node, task.node_opt.scheduleName, null, props, true, 'update')
                        props = {}
                        const schedule = getSchedule(node, task.node_opt.scheduleName)
                        console.log(schedule)
                        if (schedule) {
                            if (isValidDate(schedule.nextUTC) && isValidDate(schedule.nextEndUTC)) {
                                const durationInMinutes = Math.abs(new Date(schedule.nextUTC).getTime() - new Date(schedule.nextEndUTC).getTime()) / 60000
                                if (new Date(schedule.nextUTC) < new Date(schedule.nextEndUTC)) {
                                    props.duration = durationInMinutes
                                    props.active = false
                                } else if (new Date(schedule.nextUTC) > new Date(schedule.nextEndUTC)) {
                                    if (new Date(schedule.nextEndUTC) > new Date()) {
                                        props.duration = 24 * 60 - durationInMinutes // Subtract from 24 hours in minutes
                                        props.active = true
                                        if (props.duration && schedule.nextEndUTC) {
                                            props.currentStartTime = new Date(new Date(schedule.nextEndUTC).getTime() - (props.duration * 60000)).toISOString()
                                            console.log(props.currentStartTime)
                                        } else {
                                            props.currentStartTime = new Date().toISOString()
                                        }
                                    } else {
                                        props.active = false
                                    }
                                } else {
                                    props.duration = 0
                                    console.log('Next date is the same as next end date')
                                }
                            } else {
                                console.log('Invalid date format')
                            }
                        }
                        console.log(props)

                        updateSchedule(node, task.node_opt.scheduleName, null, props, true, 'started')
                    }

                    requestSerialisation()// request persistent state be written
                })
                .on('stopped', () => {
                    node.debug(`stopped '${task.name}' ~ '${task.node_topic}'`)
                    updateNextStatus(node)
                    if (task.node_opt.schedule) {
                        const status = getNextStatus(node, task)// get next status
                        const props = {
                            enabled: false,
                            nextDate: status.nextDate,
                            nextDescription: status.nextDescription
                        }

                        if (task.node_opt.schedule.hasDuration || task.node_opt.schedule.hasEndTime) {
                            props.active = false
                            props.currentStartTime = null
                        }

                        updateSchedule(node, task.name, task, props, true, 'stop')
                    }
                    requestSerialisation()// request persistent state be written
                })
            task.stop()// prevent bug where calling start without first calling stop causes events to bunch up
            if (opt.dontStartTheTask !== true) {
                task.start()
            }
            node.tasks.push(task)
            return task
        }
        function requestSerialisation () {
            if (node.serialisationRequestBusy || node.postponeSerialisation) {
                return
            }
            node.queuedSerialisationRequest = Date.now()
        }
        async function serialise () {
            let filePath = ''
            try {
                // if (!node.persistDynamic) {
                //     return
                // }
                if (!FSAvailable && node.storeName === 'local_file_system') {
                    return
                }
                const dynNodes = node.tasks.filter((e) => e && e.isDynamic)
                const statNodes = node.tasks.filter((e) => e && e.isDynamic !== true)

                const exp = (task) => {
                    if (task.node_opt && task.node_opt.noExport !== true) {
                        return exportTask(task, true)
                    }
                    return null
                }

                const dynNodesExp = dynNodes.map(exp).filter((task) => task !== null)
                const statNodesExp = statNodes.map(exp).filter((task) => task !== null)

                const state = {
                    dynamicSchedules: dynNodesExp,
                    staticSchedules: statNodesExp
                }
                if (node.storeName === 'NONE') {
                    return
                }

                if (node.storeName === 'local_file_system') {
                    try {
                        filePath = getPersistFilePath()
                        const fileData = JSON.stringify(state)
                        fs.writeFileSync(filePath, fileData)
                    } catch (err) {
                        node.error(`An error occurred while writing state to file '${filePath}' - (${err.message})`)
                    }
                } else {
                    const contextKey = 'state'
                    const storeName = node.storeName || 'default'
                    if (!contextAvailable || STORE_NAMES.indexOf(storeName) === -1) {
                        return
                    }
                    await contextSet(node.context(), contextKey, state, storeName)
                }

                /* if(!dynNodesExp || !dynNodesExp.length){
                    //FUTURE TODO: Sanity check before deletion
                    //and only if someone asks for it :)
                    //other wise, file clean up is a manual task
                    fs.unlinkSync(filePath);
                    return;
                } */
            } catch (e) {
                node.error(`Error saving persistence data. ${e.message}`)
            } finally {
                node.queuedSerialisationRequest = null
            }
        }
        async function deserialise () {
            let filePath = ''
            const sendSchedules = () => {
                const uiSchedules = base.stores.state.getProperty(node.id, 'schedules') || []
                const msg = { ui_update: { schedules: uiSchedules }, event: 'init' }
                base.emit('msg-input:' + node.id, msg, node)
            }
            try {
                // if (!node.persistDynamic) {
                //     return
                // }
                if (!FSAvailable && node.storeName === 'local_file_system') {
                    return
                }

                const restoreState = async (state) => {
                    if (!state) {
                        sendSchedules()
                        return // nothing to add
                    }
                    if (state.staticSchedules && state.staticSchedules.length) {
                        for (let iOpt = 0; iOpt < state.staticSchedules.length; iOpt++) {
                            const opt = state.staticSchedules[iOpt]
                            const task = node.tasks.find(e => e.name === opt.name)
                            if (task) {
                                task.node_count = opt.count
                            }
                            if (opt.isRunning === false) {
                                stopTask(node, opt.name)
                            } else if (opt.isRunning === true) {
                                startTask(node, opt.name)
                            }
                        }
                        updateNodeNextInfo(node)
                    }
                    if (state.dynamicSchedules && state.dynamicSchedules.length) {
                        // eslint-disable-next-line prefer-const
                        const uiSchedules = base.stores.state.getProperty(node.id, 'schedules') || []
                        for (let iOpt = 0; iOpt < state.dynamicSchedules.length; iOpt++) {
                            const opt = state.dynamicSchedules[iOpt]
                            let task
                            opt.name = opt.name || opt.topic
                            if (opt?.schedule) {
                                // Find the schedule
                                const scheduleIndex = uiSchedules.findIndex(storeSchedule => storeSchedule.name === opt.schedule.name)

                                if (scheduleIndex !== -1) {
                                    // Get the schedule
                                    uiSchedules[scheduleIndex] = opt.schedule
                                } else {
                                    uiSchedules.push(opt.schedule)
                                }
                                base.stores.state.set(base, node, null, 'schedules', uiSchedules)
                            }

                            opt.dontStartTheTask = !opt.isRunning
                            // eslint-disable-next-line prefer-const
                            task = await createTask(node, opt, iOpt, false)
                            if (task) {
                                task.node_count = opt.count
                                task.isRunning = opt.isRunning
                                task.isDynamic = true
                            }
                            if (opt.isRunning === false) {
                                stopTask(node, opt.name)
                            } else if (opt.isRunning === true) {
                                startTask(node, opt.name)
                            }
                        }
                        updateNodeNextInfo(node)
                        sendSchedules()
                    }
                }
                if (node.storeName === 'NONE') {
                    sendSchedules()
                    return
                }
                if (node.storeName === 'local_file_system') {
                    filePath = getPersistFilePath()
                    if (fs.existsSync(filePath)) {
                        const fileData = fs.readFileSync(filePath)
                        const state = JSON.parse(fileData)
                        await restoreState(state)
                    } else {
                        sendSchedules()
                        RED.log.debug(`scheduler: no persistence data found for node '${node.id}'.`)
                    }
                } else {
                    // use context
                    const storeName = node.storeName || 'default'
                    const contextKey = 'state'
                    if (!contextAvailable || !STORE_NAMES.indexOf(storeName)) {
                        sendSchedules()
                        return
                    }
                    const state = await contextGet(node.context(), contextKey, storeName)
                    await restoreState(state)
                }
            } catch (error) {
                sendSchedules()
                node.error(`scheduler: Error loading persistence data '${filePath}'. ${error.message}`)
            }
        }
        function getPersistFilePath () {
            const fileName = `node-${node.id}.json`
            return path.join(persistPath, fileName)
        }
        function updateNextStatus (node, force) {
            const now = new Date()
            updateNodeNextInfo(node, now)
            if (node.statusUpdatePending === true) {
                if (force) {
                    node.statusUpdatePending = false
                } else {
                    return
                }
            }

            if (node.tasks) {
                const indicator = node.nextIndicator || 'dot'
                if (node.nextDate) {
                    const d = formatShortDateTimeWithTZ(node.nextDate, node.timeZone, node.use24HourFormat) || 'Never'
                    node.status({ fill: 'blue', shape: indicator, text: (node.nextEvent || 'Next') + ': ' + d })
                } else if (node.tasks && node.tasks.length) {
                    node.status({ fill: 'grey', shape: indicator, text: 'All stopped' })
                } else {
                    node.status({}) // no tasks
                }
            } else {
                node.status({})
            }
        }
        function getNextTask (tasks) {
            try {
                const now = new Date()
                if (!tasks || !tasks.length) { return null }
                const runningTasks = tasks.filter(function (task) {
                    const finished = isTaskFinished(task)
                    return task.isRunning && (task._expression || task._sequence) && !finished
                })
                if (!runningTasks || !runningTasks.length) {
                    return null
                }

                let nextToRunTask
                if (runningTasks.length === 1) {
                    // let x = (runningTasks[0]._expression || runningTasks[0]._sequence)
                    nextToRunTask = runningTasks[0]
                    // d = x.nextDate(now);
                } else {
                    nextToRunTask = runningTasks.reduce(function (prev, current) {
                        // let p, c;
                        if (!prev) return current
                        if (!current) return prev
                        const px = (prev._expression || prev._sequence)
                        const cx = (current._expression || current._sequence)
                        return (px.nextDate(now) < cx.nextDate(now)) ? prev : current
                    })
                }
                return nextToRunTask
            } catch (error) {
                node.debug(error)
            }
            return null
        }
        function generateSendMsg (node, msg, type, index) {
            const outputCount = node.outputs
            const fanOut = node.fanOut
            const hasScheduleOutputPin = !!((node.commandResponseMsgOutput === 'output2' || fanOut))
            let outputPinIndex = 0
            const cmdOutputPin = 0
            if (fanOut) {
                if (index > -1) {
                    outputPinIndex = index + 1
                } else {
                    outputPinIndex = 0
                }
            }
            if (!fanOut && hasScheduleOutputPin) {
                outputPinIndex = 1
            }

            let idx = 0
            switch (type) {
            case 'static':
                idx = outputPinIndex
                break
            case 'dynamic':
                idx = outputPinIndex
                break
            case 'command-response':
                idx = cmdOutputPin
                break
            }
            const arr = Array(outputCount || (idx + 1))
            arr.fill(null)
            arr[idx] = msg
            return arr
        }
        // #region UI Actions
        async function submitSchedule (msg) {
            // Helper function to determine payload and payloadType
            function getPayloadAndType (schedule, valueKey, defaultValue) {
                if (schedule?.payloadType === 'custom') {
                    return {
                        payload: schedule[valueKey] ?? defaultValue,
                        payloadType: 'custom'
                    }
                } else {
                    return {
                        payload: schedule[valueKey] ?? defaultValue,
                        payloadType: 'bool'
                    }
                }
            }

            if (msg?.payload?.schedules) {
                try {
                    const schedules = base.stores.state.getProperty(node.id, 'schedules') || []
                    const scheduleArray = msg.payload.schedules
                    const cmds = []
                    scheduleArray.forEach(schedule => {
                        if (schedule.scheduleType === 'time') {
                            let startCronExpression
                            let endCronExpression

                            switch (schedule.period) {
                            case 'minutes':
                                startCronExpression = `*/${schedule.minutesInterval} * * * *`
                                if (schedule.hasDuration) {
                                    const offsetMinute = schedule.duration % 60
                                    endCronExpression = `${offsetMinute}-59/${schedule.minutesInterval} * * * *`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            case 'hourly':
                                startCronExpression = `0 */${schedule.hourlyInterval} * * *`
                                if (schedule.hasDuration) {
                                    const offsetHour = Math.floor(schedule.duration / 60)
                                    const offsetMinute = schedule.duration % 60
                                    endCronExpression = `${offsetMinute} ${offsetHour}/${schedule.hourlyInterval} * * *`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            case 'daily':
                                const dailyDaysOfWeek = schedule.days.length === 7 ? '*' : schedule.days.map(day => day.substring(0, 3).toUpperCase()).join(',')
                                const startTime = new Date()
                                startTime.setHours(schedule.time.split(':')[0])
                                startTime.setMinutes(schedule.time.split(':')[1])
                                startCronExpression = `0 ${schedule.time.split(':')[1]} ${schedule.time.split(':')[0]} * * ${dailyDaysOfWeek}`
                                if (schedule.hasEndTime) {
                                    const endTime = new Date()
                                    endTime.setHours(schedule.endTime.split(':')[0])
                                    endTime.setMinutes(schedule.endTime.split(':')[1])
                                    schedule.duration = (endTime - startTime) / 60000
                                    endCronExpression = `0 ${schedule.endTime.split(':')[1]} ${schedule.endTime.split(':')[0]} * * ${dailyDaysOfWeek}`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            case 'weekly':
                                const weeklyDaysOfWeek = schedule.days.map(day => day.substring(0, 3).toUpperCase()).join(',')
                                const startTimeWeekly = new Date()
                                startTimeWeekly.setHours(schedule.time.split(':')[0])
                                startTimeWeekly.setMinutes(schedule.time.split(':')[1])
                                startCronExpression = `0 ${schedule.time.split(':')[1]} ${schedule.time.split(':')[0]} * * ${weeklyDaysOfWeek}`
                                if (schedule.hasEndTime) {
                                    const endTimeWeekly = new Date()
                                    endTimeWeekly.setHours(schedule.endTime.split(':')[0])
                                    endTimeWeekly.setMinutes(schedule.endTime.split(':')[1])
                                    schedule.duration = (endTimeWeekly - startTimeWeekly) / 60000
                                    endCronExpression = `0 ${schedule.endTime.split(':')[1]} ${schedule.endTime.split(':')[0]} * * ${weeklyDaysOfWeek}`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            case 'monthly':
                                const hasLastDay = schedule.days.includes('Last')
                                const otherDays = schedule.days.filter(day => day !== 'Last').join(',')
                                const monthlyDays = hasLastDay ? (otherDays ? `${otherDays},L` : 'L') : otherDays
                                const startTimeMonthly = new Date()
                                startTimeMonthly.setHours(schedule.time.split(':')[0])
                                startTimeMonthly.setMinutes(schedule.time.split(':')[1])
                                startCronExpression = `0 ${schedule.time.split(':')[1]} ${schedule.time.split(':')[0]} ${monthlyDays} * *`
                                if (schedule.hasEndTime) {
                                    const endTimeMonthly = new Date()
                                    endTimeMonthly.setHours(schedule.endTime.split(':')[0])
                                    endTimeMonthly.setMinutes(schedule.endTime.split(':')[1])
                                    schedule.duration = (endTimeMonthly - startTimeMonthly) / 60000
                                    endCronExpression = `0 ${schedule.endTime.split(':')[1]} ${schedule.endTime.split(':')[0]} ${monthlyDays} * *`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            case 'yearly':
                                const startTimeYearly = new Date()
                                startTimeYearly.setHours(schedule.time.split(':')[0])
                                startTimeYearly.setMinutes(schedule.time.split(':')[1])
                                startCronExpression = `0 ${schedule.time.split(':')[1]} ${schedule.time.split(':')[0]} ${schedule.days} ${schedule.month.substring(0, 3).toUpperCase()} *`
                                if (schedule.hasEndTime) {
                                    const endTimeYearly = new Date()
                                    endTimeYearly.setHours(schedule.endTime.split(':')[0])
                                    endTimeYearly.setMinutes(schedule.endTime.split(':')[1])
                                    schedule.duration = (endTimeYearly - startTimeYearly) / 60000
                                    endCronExpression = `0 ${schedule.endTime.split(':')[1]} ${schedule.endTime.split(':')[0]} ${schedule.days} ${schedule.month.substring(0, 3).toUpperCase()} *`
                                } else {
                                    // Remove the end task if it exists
                                    deleteTask(node, `${schedule.name}_end_sched_type`)
                                }
                                break

                            default:
                                startCronExpression = '0 0 31 2 ? *' // Default to never
                            }

                            // Determine payloads and payloadTypes for start and end commands
                            const { payload: startPayload, payloadType: startPayloadType } = getPayloadAndType(schedule, 'payloadValue', true)
                            const { payload: endPayload, payloadType: endPayloadType } = getPayloadAndType(schedule, 'endPayloadValue', false)

                            // Construct startCmd
                            const startCmd = {
                                command: 'add',
                                name: schedule.name,
                                topic: schedule.topic,
                                expression: startCronExpression,
                                expressionType: 'cron',
                                payload: startPayload,
                                payloadType: startPayloadType,
                                schedule,
                                dontStartTheTask: !schedule.enabled
                            }

                            // Construct endCmd
                            const endCmd = {
                                ...startCmd,
                                name: `${schedule.name}_end_sched_type`,
                                expression: endCronExpression,
                                payload: endPayload,
                                payloadType: endPayloadType,
                                schedule: null,
                                scheduleName: schedule.name,
                                endSchedule: true
                            }

                            applyOptionDefaults(node, startCmd)

                            // abbreviate days of week to three letters
                            const dayMapping = {
                                Monday: 'Mon',
                                Tuesday: 'Tue',
                                Wednesday: 'Wed',
                                Thursday: 'Thu',
                                Friday: 'Fri',
                                Saturday: 'Sat',
                                Sunday: 'Sun'
                            }

                            const description = _describeExpression(
                                startCmd.expression,
                                startCmd.expressionType,
                                startCmd.timeZone || node.timeZone,
                                startCmd.offset,
                                startCmd.solarType,
                                startCmd.solarEvents,
                                startCmd.time,
                                startCmd,
                                node.use24HourFormat
                            ).description

                            if (description) {
                                schedule.description = description.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, match => dayMapping[match])
                            }
                            // if (schedule.hasEndTime) {
                            //     schedule.endCronExpression = endCronExpression
                            //     schedule.endTimeDescription = _describeExpression(
                            //         schedule.endCronExpression,
                            //         'cron',
                            //         schedule.timeZone || node.timeZone,
                            //         schedule.offset,
                            //         schedule.solarType,
                            //         schedule.solarEvents,
                            //         schedule.endTime,
                            //         schedule,
                            //         node.use24HourFormat
                            //     ).description
                            // }
                            if (startCronExpression) {
                                schedule.startCronExpression = startCronExpression
                                cmds.push(startCmd)
                            } else {
                                console.error('Invalid startCronExpression', startCronExpression)
                                return
                            }
                            if (endCronExpression && (schedule.hasEndTime || schedule.hasDuration)) {
                                schedule.endCronExpression = endCronExpression
                                cmds.push(endCmd)
                            }
                        } else if (schedule.scheduleType === 'solar') {
                            if (!schedule.hasDuration) {
                                // Remove the end/time task if it exists
                                deleteTask(node, `${schedule.name}_end_sched_type`)
                            }
                            // Determine payloads and payloadTypes for start and end commands
                            const { payload: startPayload, payloadType: startPayloadType } = getPayloadAndType(schedule, 'payloadValue', true)
                            const { payload: endPayload, payloadType: endPayloadType } = getPayloadAndType(schedule, 'endPayloadValue', false)

                            const solarCmd = {
                                command: 'add',
                                name: schedule.name,
                                topic: schedule.topic,
                                expressionType: 'solar',
                                solarType: 'selected',
                                solarEvents: schedule.solarEvent,
                                offset: schedule.offset,
                                locationType: 'fixed',
                                payload: schedule.solarEventStart === false && schedule.hasDuration === 'time' ? endPayload : startPayload,
                                payloadType: schedule.solarEventStart === false && schedule.hasDuration === 'time' ? endPayloadType : startPayloadType,
                                schedule,
                                dontStartTheTask: !schedule.enabled
                            }

                            schedule.description = generateSolarDescription(node, solarCmd)
                            cmds.push(solarCmd)
                            if (schedule.hasDuration === 'time' && schedule.solarEventTimespanTime) {
                                const dailyDaysOfWeek = schedule.days === undefined ? '*' : schedule.days.length === 7 ? '*' : schedule.days.map(day => day.substring(0, 3).toUpperCase()).join(',')
                                const solarTime = new Date()
                                solarTime.setHours(schedule.solarEventTimespanTime.split(':')[0])
                                solarTime.setMinutes(schedule.solarEventTimespanTime.split(':')[1])
                                const timeCronExpression = `0 ${schedule.solarEventTimespanTime.split(':')[1]} ${schedule.solarEventTimespanTime.split(':')[0]} * * ${dailyDaysOfWeek}`

                                // Construct startCmd
                                const timeCmd = {
                                    command: 'add',
                                    name: `${schedule.name}_end_sched_type`,
                                    topic: schedule.topic,
                                    expression: timeCronExpression,
                                    expressionType: 'cron',
                                    payload: schedule.solarEventStart === false && schedule.hasDuration === 'time' ? startPayload : endPayload,
                                    payloadType: schedule.solarEventStart === false && schedule.hasDuration === 'time' ? startPayloadType : endPayloadType,
                                    scheduleName: schedule.name,
                                    schedule: null,
                                    dontStartTheTask: !schedule.enabled,
                                    solarTimespanSchedule: true,
                                    solarEventStart: schedule.solarEventStart

                                }
                                cmds.push(timeCmd)
                            }
                        } else if (schedule.scheduleType === 'cron') {
                            if (schedule.startCronExpression) {
                                const startCmd = {
                                    command: 'add',
                                    name: schedule.name,
                                    topic: schedule.topic,
                                    expression: schedule.startCronExpression,
                                    expressionType: 'cron',
                                    payload: schedule?.payloadValue || true,
                                    payloadType: 'bool',
                                    schedule,
                                    dontStartTheTask: !schedule.enabled
                                }
                                applyOptionDefaults(node, startCmd)

                                // abbreviate days of week to three letters
                                const dayMapping = {
                                    Monday: 'Mon',
                                    Tuesday: 'Tue',
                                    Wednesday: 'Wed',
                                    Thursday: 'Thu',
                                    Friday: 'Fri',
                                    Saturday: 'Sat',
                                    Sunday: 'Sun'
                                }

                                const description = _describeExpression(
                                    startCmd.expression,
                                    startCmd.expressionType,
                                    startCmd.timeZone || node.timeZone,
                                    startCmd.offset,
                                    startCmd.solarType,
                                    startCmd.solarEvents,
                                    startCmd.time,
                                    startCmd,
                                    node.use24HourFormat
                                ).description

                                if (description) {
                                    schedule.description = description.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, match => dayMapping[match])
                                }

                                if (schedule.startCronExpression) {
                                    cmds.push(startCmd)
                                }
                            } else {
                                console.error('Invalid startCronExpression', schedule.startCronExpression)
                                return
                            }
                        }

                        // Find the schedule
                        const scheduleIndex = schedules.findIndex(storeSchedule => storeSchedule.name === schedule.name)

                        if (scheduleIndex !== -1) {
                            // Get the schedule
                            schedules[scheduleIndex] = schedule
                        } else {
                            schedules.push(schedule)
                        }
                    })

                    const m = { ui_update: { schedules }, event: 'submit' }
                    base.emit('msg-input:' + node.id, m, node)
                    base.stores.state.set(base, node, m, 'schedules', schedules)

                    if (cmds.length > 0) {
                        try {
                            await updateTask(node, cmds, msg)
                            updateNextStatus(node, true)
                            requestSerialisation()// update persistence

                            // get status
                            scheduleArray.forEach(msgSchedule => {
                                const scheduleIndex = schedules.findIndex(schedule => schedule.name === msgSchedule.name)

                                if (scheduleIndex !== -1) {
                                    // Request task status
                                    const task = getTask(node, msgSchedule.name)
                                    const status = getNextStatus(node, task)

                                    schedules[scheduleIndex].nextDate = status.nextDate
                                    schedules[scheduleIndex].nextDescription = status.nextDescription
                                } else {
                                    console.log('Task not found in schedules')
                                }
                            })
                        } catch (error) {
                            console.error(error)
                            return
                        }
                    }
                    base.stores.state.set(base, node, msg, 'schedules', schedules)
                    // Send the status of schedules
                    const msgStatus = { ui_update: { schedules }, event: 'submit_status' }
                    base.emit('msg-input:' + node.id, msgStatus, node)
                } catch (error) {
                    console.log(error)
                    node.error(error)
                }
            }
        }

        function removeSchedule (msg) {
            if (msg?.payload?.name) {
                const schedules = base.stores.state.getProperty(node.id, 'schedules') || []
                const scheduleIndex = schedules.findIndex(schedule => schedule.name === msg.payload.name)

                if (scheduleIndex !== -1) {
                    const schedule = schedules[scheduleIndex]
                    schedules.splice(scheduleIndex, 1)
                    base.stores.state.set(base, node, msg, 'schedules', schedules)
                    deleteTask(node, msg.payload.name)

                    if (schedule.hasEndTime || schedule.hasDuration) {
                        deleteTask(node, `${schedule.name}_end_sched_type`)
                    }

                    updateNextStatus(node, true)
                    requestSerialisation()
                    const m = { ui_update: { schedules }, event: 'remove', schedule: msg.payload.name }
                    base.emit('msg-input:' + node.id, m, node)
                } else {
                    console.log('Schedule not found for', msg?.payload?.name)
                    node.warn('No schedule found for', msg?.payload?.name)
                }
            }
        }

        function setScheduleEnabled (msg) {
            const schedules = base.stores.state.getProperty(node.id, 'schedules') || []

            function handleTask (name, enabled) {
                const scheduleIndex = schedules.findIndex(schedule => schedule.name === name)
                if (scheduleIndex !== -1) {
                    const schedule = schedules[scheduleIndex]
                    console.log(enabled)
                    console.log(schedule)
                    if (enabled) {
                        startTask(node, name)
                        if (schedule.hasEndTime || schedule.hasDuration) {
                            console.log('startTask')
                            startTask(node, `${name}_end_sched_type`)
                        }
                    } else {
                        stopTask(node, name, true)
                        if (schedule.hasEndTime || schedule.hasDuration) {
                            stopTask(node, `${name}_end_sched_type`, true)
                        }
                    }

                    updateNextStatus(node, true)
                } else {
                    console.log('Schedule not found for', name)
                    node.warn('No schedule found for', name)
                }
            }

            if (Array.isArray(msg?.payload?.names) && msg.payload.names.length > 0) {
                msg.payload.names.forEach(name => handleTask(name, msg.payload.enabled))
            } else if (msg?.payload?.name) {
                handleTask(msg.payload.name, msg.payload.enabled)
            }

            requestSerialisation()
        }

        function requestScheduleStatus (msg) {
            if (msg?.payload?.name) {
                const task = getTask(node, msg.payload.name)
                if (task) {
                    const status = getNextStatus(node, task, true)
                    const props = {
                        nextDate: status.nextDate,
                        nextDescription: status.nextDescription,
                        nextUTC: status.nextUTC,
                        nextDates: status.nextDates
                    }
                    updateSchedule(node, msg.payload.name, task, props, true, 'status')
                    updateNextStatus(node, true)
                } else {
                    console.log('Task not found for', msg.payload.name)
                    node.warn('Task not found for', msg.payload.name)
                }
            }
        }

        async function describeExpression (msg) {
            if (msg?.payload?.cronExpression) {
                const cmd = {
                    expression: msg.payload.cronExpression,
                    expressionType: 'cron'
                }

                applyOptionDefaults(node, cmd)

                // abbreviate days of week to three letters
                const dayMapping = {
                    Monday: 'Mon',
                    Tuesday: 'Tue',
                    Wednesday: 'Wed',
                    Thursday: 'Thu',
                    Friday: 'Fri',
                    Saturday: 'Sat',
                    Sunday: 'Sun'
                }

                const cronExpression = await _asyncDescribeExpression(
                    cmd.expression,
                    cmd.expressionType,
                    cmd.timeZone || node.timeZone,
                    cmd.offset,
                    cmd.solarType,
                    cmd.solarEvents,
                    null,
                    cmd,
                    node.use24HourFormat
                )

                if (cronExpression.description) {
                    cronExpression.description = cronExpression.description.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, match => dayMapping[match])
                }
                cronExpression.expression = msg.payload.cronExpression
                if (cronExpression.nextDates && cronExpression.nextDates.length) {
                    cronExpression.nextDates = cronExpression.nextDates.map(dateString => {
                        const date = new Date(dateString)
                        return formatShortDateTimeWithTZ(date, node.timeZone, node.use24HourFormat)
                    })
                }

                const m = { payload: { cronExpression }, event: 'describe' }
                base.emit('msg-input:' + node.id, m, node)
            }
        }
        // #endregion UI Actions

        // region D2
        const evts = {
            onAction: true,
            beforeSend: function (msg) {
                if (msg.action) {
                    if (msg.action === 'submit') {
                        submitSchedule(msg)
                    } else if (msg.action === 'remove') {
                        removeSchedule(msg)
                    } else if (msg.action === 'setEnabled') {
                        setScheduleEnabled(msg)
                    } else if (msg.action === 'requestStatus') {
                        requestScheduleStatus(msg)
                    } else if (msg.action === 'describe') {
                        describeExpression(msg)
                    } else { console.log('Unknown action', msg.action) }

                    if (msg.ui_update) {
                        const update = msg.ui_update
                        if (typeof update.label !== 'undefined') {
                            // dynamically set "label" property
                            base.stores.state.set(base, node, msg, 'label', update.label)
                        }
                        if (typeof update.schedules !== 'undefined') {
                            // dynamically set "schedules" property
                            base.stores.state.set(base, node, msg, 'schedules', update.schedules)
                        }
                    }
                    return msg
                }
            }
        }

        if (group) {
            group.register(node, config, evts)
        } else {
            node.error('No group configured')
        }
    }

    // #endregion D2
    // #endregion Node-RED

    function evaluateNodeProperty (value, type, node, msg) {
        return new Promise(function (resolve, reject) {
            RED.util.evaluateNodeProperty(value, type, node, msg, function (e, r) {
                if (e) {
                    reject(e)
                } else {
                    resolve(r)
                }
            })
        })
    }

    function contextGet (context, contextKey, storeName) {
        return new Promise(function (resolve, reject) {
            context.get(contextKey, storeName, function (e, r) {
                if (e) {
                    reject(e)
                } else {
                    resolve(r)
                }
            })
        })
    }

    function contextSet (context, contextKey, value, storeName) {
        return new Promise(function (resolve, reject) {
            context.set(contextKey, value, storeName, function (e, r) {
                if (e) {
                    reject(e)
                } else {
                    resolve()
                }
            })
        })
    }

    function getStoreNames () {
        const stores = ['NONE', 'local_file_system']
        if (!RED.settings.contextStorage) {
            return stores
        }
        if (typeof RED.settings.contextStorage !== 'object') {
            return stores
        }
        return [...stores, ...Object.keys(RED.settings.contextStorage)]
    }

    RED.httpAdmin.post('/ui-schedulerinject/:id', RED.auth.needsPermission('ui-scheduler.write'), function (req, res) {
        const node = RED.nodes.getNode(req.params.id)
        if (node != null) {
            try {
                node.receive()
                res.sendStatus(200)
            } catch (err) {
                res.sendStatus(500)
                node.error(RED._('inject.failed', { error: err.toString() }))
            }
        } else {
            res.sendStatus(404)
        }
    })

    RED.httpAdmin.post('/ui-scheduler/:id/:operation', RED.auth.needsPermission('ui-scheduler.read'), async function (req, res) {
        try {
            const operation = req.params.operation
            const node = RED.nodes.getNode(req.params.id)
            if (operation === 'expressionTip') {
                const timeZone = req.body.timeZone ? req.body.timeZone : undefined
                const expressionType = req.body.expressionType ? req.body.expressionType : undefined
                const opts = { expression: req.body.expression }
                if (timeZone) opts.timezone = timeZone
                if (expressionType) {
                    opts.expressionType = expressionType
                    if (opts.expressionType === 'solar') {
                        opts.solarType = req.body.solarType || ''
                        opts.solarEvents = req.body.solarEvents || ''
                        let pos = ''
                        const fakeNode = () => {
                            const n = {
                                id: req.body.nodeId,
                                _flow: {} // something - get the flow object based on req.body.flowId fc65972c8d3b1d68
                            }
                            return n
                        }

                        if (req.body.defaultLocationType === 'env') {
                            if (req.body.env) {
                                for (let index = 0; index < req.body.env.length; index++) {
                                    const envVar = req.body.env[index]
                                    if (envVar.name === req.body.defaultLocation) {
                                        pos = await evaluateNodeProperty(envVar.value, envVar.type, fakeNode())
                                        break
                                    }
                                }
                            }
                            if (!pos && node) {
                                pos = await evaluateNodeProperty(node.defaultLocation, node.defaultLocationType, node)
                            }
                        } else if (req.body.defaultLocationType === 'fixed') {
                            if (node) {
                                pos = await evaluateNodeProperty(req.body.defaultLocation, req.body.defaultLocationType, node)
                            } else {
                                pos = await evaluateNodeProperty(req.body.defaultLocation, req.body.defaultLocationType, fakeNode())
                            }
                        } else { // per schedule
                            let loc = (req.body.location + '').trim()
                            let locType = 'str'
                            if (/\$\{(.+)\}/.test(loc)) {
                                locType = 'env'
                                loc = /\$\{(.+)\}/.exec(loc)[1]
                            }
                            if (locType === 'env') {
                                for (let index = 0; index < req.body.env.length; index++) {
                                    const envVar = req.body.env[index]
                                    if (envVar.name === loc) {
                                        pos = await evaluateNodeProperty(envVar.value, envVar.type, node || fakeNode())
                                        break
                                    }
                                }
                            } else {
                                pos = await evaluateNodeProperty(loc, 'str', node || fakeNode())
                            }
                        }
                        opts.location = pos || ''
                        opts.offset = req.body.offset || 0
                    }
                }
                const exp = (opts.expressionType === 'solar') ? opts.location : opts.expression
                const h = _describeExpression(exp, opts.expressionType, opts.timezone, opts.offset, opts.solarType, opts.solarEvents, null, { locationType: opts.locationType || opts.defaultLocationType, defaultLocationType: opts.defaultLocationType, defaultLocation: opts.defaultLocation })
                let r = null
                if (opts.expressionType === 'solar') {
                    const times = h.eventTimes && h.eventTimes.slice(1)
                    r = {
                        ...opts,
                        // description: desc,
                        description: h.description,
                        // next: next,
                        next: h.nextEventTimeOffset,
                        // nextEventDesc: nextEventDesc,
                        nextEventDesc: h.nextEvent,
                        // prettyNext: prettyNext,
                        prettyNext: h.prettyNext,
                        // nextDates: nextDates
                        nextDates: times
                    }
                } else {
                    const times = h.nextDates && h.nextDates.slice(1)
                    r = {
                        ...opts,
                        description: h.description,
                        // next: next,
                        next: h.nextDate,
                        // nextEventDesc: nextEventDesc,
                        nextEventDesc: h.nextDescription,
                        // prettyNext: prettyNext,
                        prettyNext: h.prettyNext,
                        // nextDates: nextDates
                        nextDates: times
                    }
                }

                res.json(r)
            } else if (operation === 'getDynamic') {
                if (!node) {
                    res.json([])
                    return
                }
                const dynNodes = node.tasks.filter((e) => e && e.isDynamic)
                const exp = (t) => {
                    return {
                        config: exportTask(t, false),
                        status: getTaskStatus(node, t, { includeSolarStateOffset: true })
                    }
                }
                const dynNodesExp = dynNodes.map(exp)
                res.json(dynNodesExp)
            } else if (operation === 'tz') {
                res.json(timeZones)
            }
        } catch (err) {
            res.sendStatus(500)
            console.debug(err)
        }
    })

    RED.nodes.registerType('ui-scheduler', SchedulerNode)
}

/**
     * Array of timezones
     */
const timeZones = [
    { code: 'CI', latLon: '+0519-00402', tz: 'Africa/Abidjan', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'GH', latLon: '+0533-00013', tz: 'Africa/Accra', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'DZ', latLon: '3950', tz: 'Africa/Algiers', UTCOffset: '+01:00', UTCDSTOffset: '+01:00' },
    { code: 'GW', latLon: '+1151-01535', tz: 'Africa/Bissau', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'EG', latLon: '6118', tz: 'Africa/Cairo', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'MA', latLon: '+3339-00735', tz: 'Africa/Casablanca', UTCOffset: '+01:00', UTCDSTOffset: '+01:00' },
    { code: 'ES', latLon: '+3553-00519', tz: 'Africa/Ceuta', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'EH', latLon: '+2709-01312', tz: 'Africa/El_Aaiun', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'ZA', latLon: '-2615+02800', tz: 'Africa/Johannesburg', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'SS', latLon: '3587', tz: 'Africa/Juba', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'SD', latLon: '4768', tz: 'Africa/Khartoum', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'NG', latLon: '951', tz: 'Africa/Lagos', UTCOffset: '+01:00', UTCDSTOffset: '+01:00' },
    { code: 'MZ', latLon: '-2558+03235', tz: 'Africa/Maputo', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'LR', latLon: '+0618-01047', tz: 'Africa/Monrovia', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'KE', latLon: '-0117+03649', tz: 'Africa/Nairobi', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'TD', latLon: '2710', tz: 'Africa/Ndjamena', UTCOffset: '+01:00', UTCDSTOffset: '+01:00' },
    { code: 'LY', latLon: '4565', tz: 'Africa/Tripoli', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'TN', latLon: '4659', tz: 'Africa/Tunis', UTCOffset: '+01:00', UTCDSTOffset: '+01:00' },
    { code: 'NA', latLon: '-2234+01706', tz: 'Africa/Windhoek', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'US', latLon: '+515248-1763929', tz: 'America/Adak', UTCOffset: '-10:00', UTCDSTOffset: '-09:00' },
    { code: 'US', latLon: '+611305-1495401', tz: 'America/Anchorage', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'BR', latLon: '-0712-04812', tz: 'America/Araguaina', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-3436-05827', tz: 'America/Argentina/Buenos_Aires', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-2828-06547', tz: 'America/Argentina/Catamarca', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-3124-06411', tz: 'America/Argentina/Cordoba', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-2411-06518', tz: 'America/Argentina/Jujuy', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-2926-06651', tz: 'America/Argentina/La_Rioja', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-3253-06849', tz: 'America/Argentina/Mendoza', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-5138-06913', tz: 'America/Argentina/Rio_Gallegos', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-2447-06525', tz: 'America/Argentina/Salta', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-3132-06831', tz: 'America/Argentina/San_Juan', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-3319-06621', tz: 'America/Argentina/San_Luis', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-2649-06513', tz: 'America/Argentina/Tucuman', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AR', latLon: '-5448-06818', tz: 'America/Argentina/Ushuaia', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'PY', latLon: '-2516-05740', tz: 'America/Asuncion', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'CA', latLon: '+484531-0913718', tz: 'America/Atikokan', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'BR', latLon: '-1259-03831', tz: 'America/Bahia', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'MX', latLon: '+2048-10515', tz: 'America/Bahia_Banderas', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'BB', latLon: '+1306-05937', tz: 'America/Barbados', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'BR', latLon: '-0127-04829', tz: 'America/Belem', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'BZ', latLon: '+1730-08812', tz: 'America/Belize', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+5125-05707', tz: 'America/Blanc-Sablon', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'BR', latLon: '+0249-06040', tz: 'America/Boa_Vista', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'CO', latLon: '+0436-07405', tz: 'America/Bogota', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+433649-1161209', tz: 'America/Boise', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+690650-1050310', tz: 'America/Cambridge_Bay', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'BR', latLon: '-2027-05437', tz: 'America/Campo_Grande', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'MX', latLon: '+2105-08646', tz: 'America/Cancun', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'VE', latLon: '+1030-06656', tz: 'America/Caracas', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'GF', latLon: '+0456-05220', tz: 'America/Cayenne', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'US', latLon: '+4151-08739', tz: 'America/Chicago', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'MX', latLon: '+2838-10605', tz: 'America/Chihuahua', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'CR', latLon: '+0956-08405', tz: 'America/Costa_Rica', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+4906-11631', tz: 'America/Creston', UTCOffset: '-07:00', UTCDSTOffset: '-07:00' },
    { code: 'BR', latLon: '-1535-05605', tz: 'America/Cuiaba', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'CW', latLon: '+1211-06900', tz: 'America/Curacao', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'GL', latLon: '+7646-01840', tz: 'America/Danmarkshavn', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'CA', latLon: '+6404-13925', tz: 'America/Dawson', UTCOffset: '-08:00', UTCDSTOffset: '-07:00' },
    { code: 'CA', latLon: '+5946-12014', tz: 'America/Dawson_Creek', UTCOffset: '-07:00', UTCDSTOffset: '-07:00' },
    { code: 'US', latLon: '+394421-1045903', tz: 'America/Denver', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'US', latLon: '+421953-0830245', tz: 'America/Detroit', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'CA', latLon: '+5333-11328', tz: 'America/Edmonton', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'BR', latLon: '-0640-06952', tz: 'America/Eirunepe', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'SV', latLon: '+1342-08912', tz: 'America/El_Salvador', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+5848-12242', tz: 'America/Fort_Nelson', UTCOffset: '-07:00', UTCDSTOffset: '-07:00' },
    { code: 'BR', latLon: '-0343-03830', tz: 'America/Fortaleza', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'CA', latLon: '+4612-05957', tz: 'America/Glace_Bay', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'GL', latLon: '+6411-05144', tz: 'America/Godthab', UTCOffset: '-03:00', UTCDSTOffset: '-02:00' },
    { code: 'CA', latLon: '+5320-06025', tz: 'America/Goose_Bay', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'TC', latLon: '+2128-07108', tz: 'America/Grand_Turk', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'GT', latLon: '+1438-09031', tz: 'America/Guatemala', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'EC', latLon: '-0210-07950', tz: 'America/Guayaquil', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'GY', latLon: '+0648-05810', tz: 'America/Guyana', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'CA', latLon: '+4439-06336', tz: 'America/Halifax', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'CU', latLon: '+2308-08222', tz: 'America/Havana', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'MX', latLon: '+2904-11058', tz: 'America/Hermosillo', UTCOffset: '-07:00', UTCDSTOffset: '-07:00' },
    { code: 'US', latLon: '+394606-0860929', tz: 'America/Indiana/Indianapolis', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+411745-0863730', tz: 'America/Indiana/Knox', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+382232-0862041', tz: 'America/Indiana/Marengo', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+382931-0871643', tz: 'America/Indiana/Petersburg', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+375711-0864541', tz: 'America/Indiana/Tell_City', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+384452-0850402', tz: 'America/Indiana/Vevay', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+384038-0873143', tz: 'America/Indiana/Vincennes', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+410305-0863611', tz: 'America/Indiana/Winamac', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'CA', latLon: '+682059-13343', tz: 'America/Inuvik', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+6344-06828', tz: 'America/Iqaluit', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'JM', latLon: '+175805-0764736', tz: 'America/Jamaica', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+581807-1342511', tz: 'America/Juneau', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'US', latLon: '+381515-0854534', tz: 'America/Kentucky/Louisville', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+364947-0845057', tz: 'America/Kentucky/Monticello', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'BO', latLon: '-1630-06809', tz: 'America/La_Paz', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'PE', latLon: '-1203-07703', tz: 'America/Lima', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+340308-1181434', tz: 'America/Los_Angeles', UTCOffset: '-08:00', UTCDSTOffset: '-07:00' },
    { code: 'BR', latLon: '-0940-03543', tz: 'America/Maceio', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'NI', latLon: '+1209-08617', tz: 'America/Managua', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'BR', latLon: '-0308-06001', tz: 'America/Manaus', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'MQ', latLon: '+1436-06105', tz: 'America/Martinique', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'MX', latLon: '+2550-09730', tz: 'America/Matamoros', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'MX', latLon: '+2313-10625', tz: 'America/Mazatlan', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'US', latLon: '+450628-0873651', tz: 'America/Menominee', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'MX', latLon: '+2058-08937', tz: 'America/Merida', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+550737-1313435', tz: 'America/Metlakatla', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'MX', latLon: '+1924-09909', tz: 'America/Mexico_City', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'PM', latLon: '+4703-05620', tz: 'America/Miquelon', UTCOffset: '-03:00', UTCDSTOffset: '-02:00' },
    { code: 'CA', latLon: '+4606-06447', tz: 'America/Moncton', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'MX', latLon: '+2540-10019', tz: 'America/Monterrey', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'UY', latLon: '-3453-05611', tz: 'America/Montevideo', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'BS', latLon: '+2505-07721', tz: 'America/Nassau', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+404251-0740023', tz: 'America/New_York', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'CA', latLon: '+4901-08816', tz: 'America/Nipigon', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'US', latLon: '+643004-1652423', tz: 'America/Nome', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'BR', latLon: '-0351-03225', tz: 'America/Noronha', UTCOffset: '-02:00', UTCDSTOffset: '-02:00' },
    { code: 'US', latLon: '+471551-1014640', tz: 'America/North_Dakota/Beulah', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+470659-1011757', tz: 'America/North_Dakota/Center', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+465042-1012439', tz: 'America/North_Dakota/New_Salem', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'MX', latLon: '+2934-10425', tz: 'America/Ojinaga', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'PA', latLon: '+0858-07932', tz: 'America/Panama', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'CA', latLon: '+6608-06544', tz: 'America/Pangnirtung', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'SR', latLon: '+0550-05510', tz: 'America/Paramaribo', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'US', latLon: '+332654-1120424', tz: 'America/Phoenix', UTCOffset: '-07:00', UTCDSTOffset: '-07:00' },
    { code: 'TT', latLon: '+1039-06131', tz: 'America/Port_of_Spain', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'HT', latLon: '+1832-07220', tz: 'America/Port-au-Prince', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'BR', latLon: '-0846-06354', tz: 'America/Porto_Velho', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'PR', latLon: '+182806-0660622', tz: 'America/Puerto_Rico', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'CL', latLon: '-5309-07055', tz: 'America/Punta_Arenas', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'CA', latLon: '+4843-09434', tz: 'America/Rainy_River', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'CA', latLon: '+6249-0920459', tz: 'America/Rankin_Inlet', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'BR', latLon: '-0803-03454', tz: 'America/Recife', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'CA', latLon: '+5024-10439', tz: 'America/Regina', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'CA', latLon: '+744144-0944945', tz: 'America/Resolute', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'BR', latLon: '-0958-06748', tz: 'America/Rio_Branco', UTCOffset: '-05:00', UTCDSTOffset: '-05:00' },
    { code: 'BR', latLon: '-0226-05452', tz: 'America/Santarem', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'CL', latLon: '-3327-07040', tz: 'America/Santiago', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'DO', latLon: '+1828-06954', tz: 'America/Santo_Domingo', UTCOffset: '-04:00', UTCDSTOffset: '-04:00' },
    { code: 'BR', latLon: '-2332-04637', tz: 'America/Sao_Paulo', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'GL', latLon: '+7029-02158', tz: 'America/Scoresbysund', UTCOffset: '-01:00', UTCDSTOffset: '+00:00' },
    { code: 'US', latLon: '+571035-1351807', tz: 'America/Sitka', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'CA', latLon: '+4734-05243', tz: 'America/St_Johns', UTCOffset: '-03:30', UTCDSTOffset: '-02:30' },
    { code: 'CA', latLon: '+5017-10750', tz: 'America/Swift_Current', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'HN', latLon: '+1406-08713', tz: 'America/Tegucigalpa', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'GL', latLon: '+7634-06847', tz: 'America/Thule', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'CA', latLon: '+4823-08915', tz: 'America/Thunder_Bay', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'MX', latLon: '+3232-11701', tz: 'America/Tijuana', UTCOffset: '-08:00', UTCDSTOffset: '-07:00' },
    { code: 'CA', latLon: '+4339-07923', tz: 'America/Toronto', UTCOffset: '-05:00', UTCDSTOffset: '-04:00' },
    { code: 'CA', latLon: '+4916-12307', tz: 'America/Vancouver', UTCOffset: '-08:00', UTCDSTOffset: '-07:00' },
    { code: 'CA', latLon: '+6043-13503', tz: 'America/Whitehorse', UTCOffset: '-08:00', UTCDSTOffset: '-07:00' },
    { code: 'CA', latLon: '+4953-09709', tz: 'America/Winnipeg', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'US', latLon: '+593249-1394338', tz: 'America/Yakutat', UTCOffset: '-09:00', UTCDSTOffset: '-08:00' },
    { code: 'CA', latLon: '+6227-11421', tz: 'America/Yellowknife', UTCOffset: '-07:00', UTCDSTOffset: '-06:00' },
    { code: 'AQ', latLon: '-6617+11031', tz: 'Antarctica/Casey', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'AQ', latLon: '-6835+07758', tz: 'Antarctica/Davis', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'AQ', latLon: '-6640+14001', tz: 'Antarctica/DumontDUrville', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'AU', latLon: '-5430+15857', tz: 'Antarctica/Macquarie', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'AQ', latLon: '-6736+06253', tz: 'Antarctica/Mawson', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'AQ', latLon: '-6448-06406', tz: 'Antarctica/Palmer', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AQ', latLon: '-6734-06808', tz: 'Antarctica/Rothera', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AQ', latLon: '-690022+0393524', tz: 'Antarctica/Syowa', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'AQ', latLon: '-720041+0023206', tz: 'Antarctica/Troll', UTCOffset: '+00:00', UTCDSTOffset: '+02:00' },
    { code: 'AQ', latLon: '-7824+10654', tz: 'Antarctica/Vostok', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'KZ', latLon: '11972', tz: 'Asia/Almaty', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'JO', latLon: '6713', tz: 'Asia/Amman', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'RU', latLon: '24174', tz: 'Asia/Anadyr', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'KZ', latLon: '9447', tz: 'Asia/Aqtau', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'KZ', latLon: '10727', tz: 'Asia/Aqtobe', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'TM', latLon: '9580', tz: 'Asia/Ashgabat', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'KZ', latLon: '9863', tz: 'Asia/Atyrau', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'IQ', latLon: '7746', tz: 'Asia/Baghdad', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'AZ', latLon: '8974', tz: 'Asia/Baku', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'TH', latLon: '11376', tz: 'Asia/Bangkok', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'RU', latLon: '13667', tz: 'Asia/Barnaul', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'LB', latLon: '6883', tz: 'Asia/Beirut', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'KG', latLon: '11690', tz: 'Asia/Bishkek', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'BN', latLon: '11911', tz: 'Asia/Brunei', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'RU', latLon: '16531', tz: 'Asia/Chita', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'MN', latLon: '16234', tz: 'Asia/Choibalsan', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'LK', latLon: '8607', tz: 'Asia/Colombo', UTCOffset: '+05:30', UTCDSTOffset: '+05:30' },
    { code: 'SY', latLon: '6948', tz: 'Asia/Damascus', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'BD', latLon: '11368', tz: 'Asia/Dhaka', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'TL', latLon: '-0833+12535', tz: 'Asia/Dili', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'AE', latLon: '8036', tz: 'Asia/Dubai', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'TJ', latLon: '10683', tz: 'Asia/Dushanbe', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'CY', latLon: '6864', tz: 'Asia/Famagusta', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'PS', latLon: '6558', tz: 'Asia/Gaza', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'PS', latLon: '353674', tz: 'Asia/Hebron', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'VN', latLon: '11685', tz: 'Asia/Ho_Chi_Minh', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'HK', latLon: '13626', tz: 'Asia/Hong_Kong', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'MN', latLon: '13940', tz: 'Asia/Hovd', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'RU', latLon: '15636', tz: 'Asia/Irkutsk', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'ID', latLon: '-0610+10648', tz: 'Asia/Jakarta', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'ID', latLon: '-0232+14042', tz: 'Asia/Jayapura', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'IL', latLon: '665976', tz: 'Asia/Jerusalem', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'AF', latLon: '10343', tz: 'Asia/Kabul', UTCOffset: '+04:30', UTCDSTOffset: '+04:30' },
    { code: 'RU', latLon: '21140', tz: 'Asia/Kamchatka', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'PK', latLon: '9155', tz: 'Asia/Karachi', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'NP', latLon: '11262', tz: 'Asia/Kathmandu', UTCOffset: '+05:45', UTCDSTOffset: '+05:45' },
    { code: 'RU', latLon: '1977237', tz: 'Asia/Khandyga', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'IN', latLon: '11054', tz: 'Asia/Kolkata', UTCOffset: '+05:30', UTCDSTOffset: '+05:30' },
    { code: 'RU', latLon: '14851', tz: 'Asia/Krasnoyarsk', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'MY', latLon: '10452', tz: 'Asia/Kuala_Lumpur', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'MY', latLon: '11153', tz: 'Asia/Kuching', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'MO', latLon: '13549', tz: 'Asia/Macau', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'RU', latLon: '20982', tz: 'Asia/Magadan', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'ID', latLon: '-0507+11924', tz: 'Asia/Makassar', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'PH', latLon: '13535', tz: 'Asia/Manila', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'RU', latLon: '14052', tz: 'Asia/Novokuznetsk', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'RU', latLon: '13757', tz: 'Asia/Novosibirsk', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'RU', latLon: '12824', tz: 'Asia/Omsk', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'KZ', latLon: '10234', tz: 'Asia/Oral', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'ID', latLon: '-0002+10920', tz: 'Asia/Pontianak', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'KP', latLon: '16446', tz: 'Asia/Pyongyang', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'QA', latLon: '7649', tz: 'Asia/Qatar', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'KZ', latLon: '10976', tz: 'Asia/Qyzylorda', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'SA', latLon: '7081', tz: 'Asia/Riyadh', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'RU', latLon: '18900', tz: 'Asia/Sakhalin', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'UZ', latLon: '10588', tz: 'Asia/Samarkand', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'KR', latLon: '16391', tz: 'Asia/Seoul', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'CN', latLon: '15242', tz: 'Asia/Shanghai', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'SG', latLon: '10468', tz: 'Asia/Singapore', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'RU', latLon: '22071', tz: 'Asia/Srednekolymsk', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'TW', latLon: '14633', tz: 'Asia/Taipei', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'UZ', latLon: '11038', tz: 'Asia/Tashkent', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'GE', latLon: '8592', tz: 'Asia/Tbilisi', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'IR', latLon: '8666', tz: 'Asia/Tehran', UTCOffset: '+03:30', UTCDSTOffset: '+04:30' },
    { code: 'BT', latLon: '11667', tz: 'Asia/Thimphu', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'JP', latLon: '1748357', tz: 'Asia/Tokyo', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'RU', latLon: '14088', tz: 'Asia/Tomsk', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'MN', latLon: '15408', tz: 'Asia/Ulaanbaatar', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'CN', latLon: '13083', tz: 'Asia/Urumqi', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'RU', latLon: '2074673', tz: 'Asia/Ust-Nera', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'RU', latLon: '17466', tz: 'Asia/Vladivostok', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'RU', latLon: '19140', tz: 'Asia/Yakutsk', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'MM', latLon: '11257', tz: 'Asia/Yangon', UTCOffset: '+06:30', UTCDSTOffset: '+06:30' },
    { code: 'RU', latLon: '11687', tz: 'Asia/Yekaterinburg', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'AM', latLon: '8441', tz: 'Asia/Yerevan', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'PT', latLon: '+3744-02540', tz: 'Atlantic/Azores', UTCOffset: '-01:00', UTCDSTOffset: '+00:00' },
    { code: 'BM', latLon: '+3217-06446', tz: 'Atlantic/Bermuda', UTCOffset: '-04:00', UTCDSTOffset: '-03:00' },
    { code: 'ES', latLon: '+2806-01524', tz: 'Atlantic/Canary', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'CV', latLon: '+1455-02331', tz: 'Atlantic/Cape_Verde', UTCOffset: '-01:00', UTCDSTOffset: '-01:00' },
    { code: 'FO', latLon: '+6201-00646', tz: 'Atlantic/Faroe', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'PT', latLon: '+3238-01654', tz: 'Atlantic/Madeira', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'IS', latLon: '+6409-02151', tz: 'Atlantic/Reykjavik', UTCOffset: '+00:00', UTCDSTOffset: '+00:00' },
    { code: 'GS', latLon: '-5416-03632', tz: 'Atlantic/South_Georgia', UTCOffset: '-02:00', UTCDSTOffset: '-02:00' },
    { code: 'FK', latLon: '-5142-05751', tz: 'Atlantic/Stanley', UTCOffset: '-03:00', UTCDSTOffset: '-03:00' },
    { code: 'AU', latLon: '-3455+13835', tz: 'Australia/Adelaide', UTCOffset: '+09:30', UTCDSTOffset: '+10:30' },
    { code: 'AU', latLon: '-2728+15302', tz: 'Australia/Brisbane', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'AU', latLon: '-3157+14127', tz: 'Australia/Broken_Hill', UTCOffset: '+09:30', UTCDSTOffset: '+10:30' },
    { code: 'AU', latLon: '-3956+14352', tz: 'Australia/Currie', UTCOffset: '+10:00', UTCDSTOffset: '+11:00' },
    { code: 'AU', latLon: '-1228+13050', tz: 'Australia/Darwin', UTCOffset: '+09:30', UTCDSTOffset: '+09:30' },
    { code: 'AU', latLon: '-3143+12852', tz: 'Australia/Eucla', UTCOffset: '+08:45', UTCDSTOffset: '+08:45' },
    { code: 'AU', latLon: '-4253+14719', tz: 'Australia/Hobart', UTCOffset: '+10:00', UTCDSTOffset: '+11:00' },
    { code: 'AU', latLon: '-2016+14900', tz: 'Australia/Lindeman', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'AU', latLon: '-3133+15905', tz: 'Australia/Lord_Howe', UTCOffset: '+10:30', UTCDSTOffset: '+11:00' },
    { code: 'AU', latLon: '-3749+14458', tz: 'Australia/Melbourne', UTCOffset: '+10:00', UTCDSTOffset: '+11:00' },
    { code: 'AU', latLon: '-3157+11551', tz: 'Australia/Perth', UTCOffset: '+08:00', UTCDSTOffset: '+08:00' },
    { code: 'AU', latLon: '-3352+15113', tz: 'Australia/Sydney', UTCOffset: '+10:00', UTCDSTOffset: '+11:00' },
    { code: 'NL', latLon: '5676', tz: 'Europe/Amsterdam', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'AD', latLon: '4361', tz: 'Europe/Andorra', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'RU', latLon: '9424', tz: 'Europe/Astrakhan', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'GR', latLon: '6101', tz: 'Europe/Athens', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'RS', latLon: '6480', tz: 'Europe/Belgrade', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'DE', latLon: '6552', tz: 'Europe/Berlin', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'BE', latLon: '5470', tz: 'Europe/Brussels', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'RO', latLon: '7032', tz: 'Europe/Bucharest', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'HU', latLon: '6635', tz: 'Europe/Budapest', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'MD', latLon: '7550', tz: 'Europe/Chisinau', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'DK', latLon: '6775', tz: 'Europe/Copenhagen', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'IE', latLon: '+5320-00615', tz: 'Europe/Dublin', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'GI', latLon: '+3608-00521', tz: 'Europe/Gibraltar', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'FI', latLon: '8468', tz: 'Europe/Helsinki', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'TR', latLon: '6959', tz: 'Europe/Istanbul', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'RU', latLon: '7473', tz: 'Europe/Kaliningrad', UTCOffset: '+02:00', UTCDSTOffset: '+02:00' },
    { code: 'UA', latLon: '8057', tz: 'Europe/Kiev', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'RU', latLon: '10775', tz: 'Europe/Kirov', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'PT', latLon: '+3843-00908', tz: 'Europe/Lisbon', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'GB', latLon: '+513030-0000731', tz: 'Europe/London', UTCOffset: '+00:00', UTCDSTOffset: '+01:00' },
    { code: 'LU', latLon: '5545', tz: 'Europe/Luxembourg', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'ES', latLon: '+4024-00341', tz: 'Europe/Madrid', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'MT', latLon: '4985', tz: 'Europe/Malta', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'BY', latLon: '8088', tz: 'Europe/Minsk', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'MC', latLon: '5065', tz: 'Europe/Monaco', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'RU', latLon: '928225', tz: 'Europe/Moscow', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'CY', latLon: '6832', tz: 'Asia/Nicosia', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'NO', latLon: '7000', tz: 'Europe/Oslo', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'FR', latLon: '5072', tz: 'Europe/Paris', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'CZ', latLon: '6431', tz: 'Europe/Prague', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'LV', latLon: '8063', tz: 'Europe/Riga', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'IT', latLon: '5383', tz: 'Europe/Rome', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'RU', latLon: '10321', tz: 'Europe/Samara', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'RU', latLon: '9736', tz: 'Europe/Saratov', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'UA', latLon: '7863', tz: 'Europe/Simferopol', UTCOffset: '+03:00', UTCDSTOffset: '+03:00' },
    { code: 'BG', latLon: '6560', tz: 'Europe/Sofia', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'SE', latLon: '7723', tz: 'Europe/Stockholm', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'EE', latLon: '8370', tz: 'Europe/Tallinn', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'AL', latLon: '6070', tz: 'Europe/Tirane', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'RU', latLon: '10244', tz: 'Europe/Ulyanovsk', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'UA', latLon: '7055', tz: 'Europe/Uzhgorod', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'AT', latLon: '6433', tz: 'Europe/Vienna', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'LT', latLon: '7960', tz: 'Europe/Vilnius', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'RU', latLon: '9269', tz: 'Europe/Volgograd', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'PL', latLon: '7315', tz: 'Europe/Warsaw', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'UA', latLon: '8260', tz: 'Europe/Zaporozhye', UTCOffset: '+02:00', UTCDSTOffset: '+03:00' },
    { code: 'CH', latLon: '5555', tz: 'Europe/Zurich', UTCOffset: '+01:00', UTCDSTOffset: '+02:00' },
    { code: 'IO', latLon: '-0720+07225', tz: 'Indian/Chagos', UTCOffset: '+06:00', UTCDSTOffset: '+06:00' },
    { code: 'CX', latLon: '-1025+10543', tz: 'Indian/Christmas', UTCOffset: '+07:00', UTCDSTOffset: '+07:00' },
    { code: 'CC', latLon: '-1210+09655', tz: 'Indian/Cocos', UTCOffset: '+06:30', UTCDSTOffset: '+06:30' },
    { code: 'TF', latLon: '-492110+0701303', tz: 'Indian/Kerguelen', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'SC', latLon: '-0440+05528', tz: 'Indian/Mahe', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'MV', latLon: '7740', tz: 'Indian/Maldives', UTCOffset: '+05:00', UTCDSTOffset: '+05:00' },
    { code: 'MU', latLon: '-2010+05730', tz: 'Indian/Mauritius', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'RE', latLon: '-2052+05528', tz: 'Indian/Reunion', UTCOffset: '+04:00', UTCDSTOffset: '+04:00' },
    { code: 'WS', latLon: '-1350-17144', tz: 'Pacific/Apia', UTCOffset: '+13:00', UTCDSTOffset: '+14:00' },
    { code: 'NZ', latLon: '-3652+17446', tz: 'Pacific/Auckland', UTCOffset: '+12:00', UTCDSTOffset: '+13:00' },
    { code: 'PG', latLon: '-0613+15534', tz: 'Pacific/Bougainville', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'NZ', latLon: '-4357-17633', tz: 'Pacific/Chatham', UTCOffset: '+12:45', UTCDSTOffset: '+13:45' },
    { code: 'FM', latLon: '15872', tz: 'Pacific/Chuuk', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'CL', latLon: '-2709-10926', tz: 'Pacific/Easter', UTCOffset: '-06:00', UTCDSTOffset: '-05:00' },
    { code: 'VU', latLon: '-1740+16825', tz: 'Pacific/Efate', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'KI', latLon: '-0308-17105', tz: 'Pacific/Enderbury', UTCOffset: '+13:00', UTCDSTOffset: '+13:00' },
    { code: 'TK', latLon: '-0922-17114', tz: 'Pacific/Fakaofo', UTCOffset: '+13:00', UTCDSTOffset: '+13:00' },
    { code: 'FJ', latLon: '-1808+17825', tz: 'Pacific/Fiji', UTCOffset: '+12:00', UTCDSTOffset: '+13:00' },
    { code: 'TV', latLon: '-0831+17913', tz: 'Pacific/Funafuti', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'EC', latLon: '-0054-08936', tz: 'Pacific/Galapagos', UTCOffset: '-06:00', UTCDSTOffset: '-06:00' },
    { code: 'PF', latLon: '-2308-13457', tz: 'Pacific/Gambier', UTCOffset: '-09:00', UTCDSTOffset: '-09:00' },
    { code: 'SB', latLon: '-0932+16012', tz: 'Pacific/Guadalcanal', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'GU', latLon: '15773', tz: 'Pacific/Guam', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'US', latLon: '+211825-1575130', tz: 'Pacific/Honolulu', UTCOffset: '-10:00', UTCDSTOffset: '-10:00' },
    { code: 'KI', latLon: '+0152-15720', tz: 'Pacific/Kiritimati', UTCOffset: '+14:00', UTCDSTOffset: '+14:00' },
    { code: 'FM', latLon: '16778', tz: 'Pacific/Kosrae', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'MH', latLon: '17625', tz: 'Pacific/Kwajalein', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'MH', latLon: '17821', tz: 'Pacific/Majuro', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'PF', latLon: '-0900-13930', tz: 'Pacific/Marquesas', UTCOffset: '-09:30', UTCDSTOffset: '-09:30' },
    { code: 'NR', latLon: '-0031+16655', tz: 'Pacific/Nauru', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'NU', latLon: '-1901-16955', tz: 'Pacific/Niue', UTCOffset: '-11:00', UTCDSTOffset: '-11:00' },
    { code: 'NF', latLon: '-2903+16758', tz: 'Pacific/Norfolk', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'NC', latLon: '-2216+16627', tz: 'Pacific/Noumea', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'AS', latLon: '-1416-17042', tz: 'Pacific/Pago_Pago', UTCOffset: '-11:00', UTCDSTOffset: '-11:00' },
    { code: 'PW', latLon: '14149', tz: 'Pacific/Palau', UTCOffset: '+09:00', UTCDSTOffset: '+09:00' },
    { code: 'PN', latLon: '-2504-13005', tz: 'Pacific/Pitcairn', UTCOffset: '-08:00', UTCDSTOffset: '-08:00' },
    { code: 'FM', latLon: '16471', tz: 'Pacific/Pohnpei', UTCOffset: '+11:00', UTCDSTOffset: '+11:00' },
    { code: 'PG', latLon: '-0930+14710', tz: 'Pacific/Port_Moresby', UTCOffset: '+10:00', UTCDSTOffset: '+10:00' },
    { code: 'CK', latLon: '-2114-15946', tz: 'Pacific/Rarotonga', UTCOffset: '-10:00', UTCDSTOffset: '-10:00' },
    { code: 'PF', latLon: '-1732-14934', tz: 'Pacific/Tahiti', UTCOffset: '-10:00', UTCDSTOffset: '-10:00' },
    { code: 'KI', latLon: '17425', tz: 'Pacific/Tarawa', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'TO', latLon: '-2110-17510', tz: 'Pacific/Tongatapu', UTCOffset: '+13:00', UTCDSTOffset: '+14:00' },
    { code: 'UM', latLon: '18554', tz: 'Pacific/Wake', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' },
    { code: 'WF', latLon: '-1318-17610', tz: 'Pacific/Wallis', UTCOffset: '+12:00', UTCDSTOffset: '+12:00' }
]
