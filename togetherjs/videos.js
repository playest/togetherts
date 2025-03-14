/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "./elementFinder", "./session", "jquery"], function (require, exports, elementFinder_1, session_1, jquery_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    jquery_1 = __importDefault(jquery_1);
    //define(["jquery", "util", "session", "elementFinder"], function($: JQueryStatic, _util: TogetherJSNS.Util, session: TogetherJSNS.Session, elementFinder: TogetherJSNS.ElementFinder) {
    let listeners = [];
    const TIME_UPDATE = 'timeupdate';
    const MIRRORED_EVENTS = ['play', 'pause'];
    const TOO_FAR_APART = 3000;
    session_1.session.on("reinitialize", function () {
        unsetListeners();
        setupListeners();
    });
    session_1.session.on("ui-ready", setupListeners);
    function setupListeners() {
        const videos = (0, jquery_1.default)('video');
        setupMirroredEvents(videos);
        setupTimeSync(videos);
    }
    function setupMirroredEvents(videos) {
        let currentListener;
        MIRRORED_EVENTS.forEach(function (eventName) {
            currentListener = makeEventSender(eventName);
            videos.on(eventName, currentListener);
            listeners.push({
                name: eventName,
                listener: currentListener
            });
        });
    }
    function makeEventSender(eventName) {
        return function (event, options = {}) {
            const element = event.target;
            if (!options.silent && element) {
                session_1.session.send({
                    type: `video-${eventName}`,
                    location: elementFinder_1.elementFinder.elementLocation(element),
                    position: element.currentTime
                });
            }
        };
    }
    function setupTimeSync(videos) {
        videos.each(function (_i, video) {
            const onTimeUpdate = makeTimeUpdater();
            (0, jquery_1.default)(video).on(TIME_UPDATE, onTimeUpdate);
            listeners.push({
                name: TIME_UPDATE,
                listener: onTimeUpdate
            });
        });
    }
    function makeTimeUpdater() {
        let last = 0;
        return function (event) {
            const currentTime = event.target.currentTime;
            if (areTooFarApart(currentTime, last)) {
                makeEventSender(TIME_UPDATE)(event);
            }
            last = currentTime;
        };
    }
    function areTooFarApart(currentTime, lastTime) {
        const secDiff = Math.abs(currentTime - lastTime);
        const milliDiff = secDiff * 1000;
        return milliDiff > TOO_FAR_APART;
    }
    session_1.session.on("close", unsetListeners);
    function unsetListeners() {
        const videos = (0, jquery_1.default)('video');
        listeners.forEach(function (event) {
            videos.off(event.name, event.listener);
        });
        listeners = [];
    }
    session_1.session.hub.on('video-timeupdate', function (msg) {
        const element = $findElement(msg.location);
        const oldTime = element.prop('currentTime');
        const newTime = msg.position;
        //to help throttle uneccesary position changes
        if (areTooFarApart(oldTime, newTime)) {
            setTime(element, msg.position);
        }
    });
    MIRRORED_EVENTS.forEach(function (eventName) {
        session_1.session.hub.on(`video-${eventName}`, function (msg) {
            const element = $findElement(msg.location);
            setTime(element, msg.position);
            element.trigger(eventName, { silent: true });
        });
    });
    //Currently does not discriminate between visible and invisible videos
    function $findElement(location) {
        return (0, jquery_1.default)(elementFinder_1.elementFinder.findElement(location));
    }
    function setTime(video, time) {
        video.prop('currentTime', time);
    }
});
