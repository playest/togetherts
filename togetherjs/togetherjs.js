"use strict";
/* This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
*/
// True if this file should use minimized sub-resources:
//@ts-expect-error _min_ is replaced in packaging so comparison always looks false in raw code
// eslint-disable-next-line no-constant-condition
let min = "__min__" == "__" + "min__" ? false : "__min__" == "yes";
function addStyle(styleSheetUrl, baseUrl, cacheBust) {
    const existing = document.getElementById("togetherjs-stylesheet");
    if (!existing) {
        const link = document.createElement("link");
        link.id = "togetherjs-stylesheet";
        link.setAttribute("rel", "stylesheet");
        link.href = baseUrl + styleSheetUrl + (cacheBust ? ("?bust=" + cacheBust) : '');
        document.head.appendChild(link);
    }
}
function addScript(url, baseUrl, cacheBust) {
    const script = document.createElement("script");
    script.src = baseUrl + url + (cacheBust ? ("?bust=" + cacheBust) : '');
    document.head.appendChild(script);
}
function computeBaseUrl() {
    let baseUrl = "__baseUrl__";
    if (baseUrl == "__" + "baseUrl__") {
        // Reset the variable if it doesn't get substituted
        baseUrl = "";
    }
    // Allow override of baseUrl (this is done separately because it needs
    // to be done very early)
    if (window.TogetherJSConfig && window.TogetherJSConfig.baseUrl) {
        baseUrl = window.TogetherJSConfig.baseUrl;
    }
    if (window.TogetherJSConfig_baseUrl) {
        baseUrl = window.TogetherJSConfig_baseUrl;
    }
    return baseUrl;
}
function computeCacheBust() {
    let cacheBust = "__gitCommit__";
    if (!cacheBust || cacheBust == "__" + "gitCommit__") {
        cacheBust = Date.now().toString();
    }
    return cacheBust;
}
// FIXME: we could/should use a version from the checkout, at least for production
function computeVersion() {
    let version = "__gitCommit__";
    if (!version || version == "__" + "gitCommit__") {
        version = "unknown";
    }
    return version;
}
class OnClass {
    constructor() {
        this._listeners = {};
        this.removeListener = this.off.bind(this); // TODO can be removed apparently
    }
    on(name, callback) {
        if (typeof callback != "function") {
            console.warn("Bad callback for", this, ".once(", name, ", ", callback, ")");
            throw "Error: .once() called with non-callback";
        }
        if (name.search(" ") != -1) {
            const names = name.split(/ +/g);
            names.forEach((n) => {
                this.on(n, callback); // TODO this cast is abusive, changing the name argument to be a array of event could solve that
            });
            return;
        }
        if (this._knownEvents && this._knownEvents.indexOf(name) == -1) {
            let thisString = "" + this;
            if (thisString.length > 20) {
                thisString = thisString.substr(0, 20) + "...";
            }
            console.warn(thisString + ".on('" + name + "', ...): unknown event");
            if (console.trace) {
                console.trace();
            }
        }
        if (!this._listeners[name]) {
            this._listeners[name] = [];
        }
        if (this._listeners[name].indexOf(callback) == -1) {
            this._listeners[name].push(callback);
        }
    }
    once(name, callback) {
        if (typeof callback != "function") {
            console.warn("Bad callback for", this, ".once(", name, ", ", callback, ")");
            throw "Error: .once() called with non-callback";
        }
        const cb = callback; // TODO how to avoid this cast?
        const attr = "onceCallback_" + name;
        // FIXME: maybe I should add the event name to the .once attribute:
        if (!cb[attr]) {
            const onceCallback = function (...args) {
                cb.apply(this, args);
                this.off(name, onceCallback);
                delete cb[attr];
            };
            cb[attr] = onceCallback;
        }
        this.on(name, cb[attr]); // TODO cast
    }
    off(name, callback) {
        if (this._listenerOffs) {
            // Defer the .off() call until the .emit() is done.
            this._listenerOffs.push([name, callback]);
            return;
        }
        if (name.search(" ") != -1) {
            const names = name.split(/ +/g);
            names.forEach(function (n) {
                this.off(n, callback); // TODO cast as keyof TogetherJSNS.OnMap is abusive, we should forbid passing multiple events (as a space separated string) to this function
            }, this);
            return;
        }
        if (!this._listeners[name]) {
            return;
        }
        const l = this._listeners[name], _len = l.length;
        for (let i = 0; i < _len; i++) {
            if (l[i] == callback) {
                l.splice(i, 1);
                break;
            }
        }
    }
    emit(name, ...args) {
        const offs = this._listenerOffs = [];
        if ((!this._listeners) || !this._listeners[name]) {
            return;
        }
        const l = this._listeners[name];
        l.forEach(function (callback) {
            callback.apply(this, args);
        }, this);
        delete this._listenerOffs;
        if (offs.length) {
            offs.forEach(function (item) {
                this.off(item[0], item[1]);
            }, this);
        }
    }
    forProtocol() {
        return this; // TODO cast
    }
}
class ConfigClass {
    constructor(configuration, running) {
        this.configuration = configuration;
        this.running = running;
        this._configTrackers = {};
        this._configClosed = {};
    }
    call(name, maybeValue) {
        var _a;
        if (name == "loaded" || name == "callToStart") {
            console.error("Cannot change loaded or callToStart values");
            return;
        }
        if (this._configClosed[name] && this.running) {
            throw new Error("The configuration " + name + " is finalized and cannot be changed");
        }
        const previous = this.configuration[name];
        const value = maybeValue;
        this.configuration[name] = value; // TODO any, how to remove this any
        const trackers = (_a = this._configTrackers[name]) !== null && _a !== void 0 ? _a : [];
        let failed = false;
        for (let i = 0; i < trackers.length; i++) {
            try {
                trackers[i](value, previous);
            }
            catch (e) {
                console.warn("Error setting configuration", name, "to", value, ":", e, "; reverting to", previous);
                failed = true;
                break;
            }
        }
        if (failed) {
            this.configuration[name] = previous; // TODO any, how to remove this any?
            for (let i = 0; i < trackers.length; i++) {
                try {
                    trackers[i](value);
                }
                catch (e) {
                    console.warn("Error REsetting configuration", name, "to", previous, ":", e, "(ignoring)");
                }
            }
        }
    }
    get(name) {
        return this.configuration[name];
    }
    track(name, callback) {
        const v = this.get(name);
        callback(v);
        if (!this._configTrackers[name]) {
            this._configTrackers[name] = [];
        }
        // TODO any how to make callback typecheck?
        this._configTrackers[name].push(callback); // TODO ! and any cast
        return callback;
    }
    /** Freeze the configuration attribute */
    close(name) {
        if (!Object.prototype.hasOwnProperty.call(this.configuration, name)) {
            throw new Error("Configuration is unknown: " + name);
        }
        this._configClosed[name] = true;
        return this.get(name);
    }
    has(name) {
        return name in this.configuration;
    }
}
class TogetherJSClass extends OnClass {
    constructor(requireConfig, version, baseUrl, configuration, startup) {
        super();
        this.requireConfig = requireConfig;
        this.version = version;
        this.baseUrl = baseUrl;
        this.startup = startup;
        this.startupReason = null;
        this._running = false;
        this.require = null;
        this.hub = new OnClass();
        /** Time at which the page was loaded */
        this.pageLoaded = Date.now();
        this.editTrackers = {};
        this.requireObject = null;
        this.listener = null;
        this.startupInit = Object.assign({}, startup);
        this._knownEvents = ["ready", "close"];
        this.config = new ConfigClass(configuration, this.running);
        this.startup.button = null;
    }
    get running() {
        return this._running;
    }
    set running(running) {
        this._running = running;
        this.config.running = running;
    }
    start(event) {
        var _a;
        const cacheBust = computeCacheBust();
        let session;
        if (this.running && this.require != null) {
            session = this.require("session").session;
            session.close();
            return;
        }
        try {
            if (event && typeof event == "object") {
                if ("target" in event && event.target && typeof event) {
                    this.startup.button = event.target;
                }
                else if ("nodeType" in event && event.nodeType == 1) {
                    this.startup.button = event;
                }
                else if (Array.isArray(event) && event[0] && event[0].nodeType == 1) {
                    // TODO What?
                    // Probably a jQuery element
                    this.startup.button = event[0];
                }
            }
        }
        catch (e) {
            console.warn("Error determining starting button:", e);
        }
        if (window.TogetherJSConfig && (!window.TogetherJSConfig.loaded)) {
            let attr;
            for (attr in window.TogetherJSConfig) {
                this.config.call(attr, window.TogetherJSConfig[attr]);
            }
            window.TogetherJSConfig.loaded = true;
        }
        // This handles loading configuration from global variables.  This includes TogetherJSConfig_on_*, which are attributes folded into the "on" configuration value.
        let attr;
        let attrName;
        const globalOns = {};
        for (attr in window) {
            if (attr.indexOf("TogetherJSConfig_on_") === 0) {
                attrName = attr.substr(("TogetherJSConfig_on_").length);
                globalOns[attrName] = window[attr];
            }
            else if (attr.indexOf("TogetherJSConfig_") === 0) {
                attrName = attr.substr(("TogetherJSConfig_").length);
                this.config.call(attrName, window[attr]); // TODO this cast is here because Window has an index signature that always return a Window
            }
        }
        // FIXME: copy existing config?
        // FIXME: do this directly in this.config() ?
        // FIXME: close these configs?
        const ons = this.config.get("on") || {};
        for (attr in globalOns) {
            if (Object.prototype.hasOwnProperty.call(globalOns, attr)) {
                // FIXME: should we avoid overwriting?  Maybe use arrays?
                ons[attr] = globalOns[attr];
            }
        }
        this.config.call("on", ons);
        for (attr in ons) {
            this.on(attr, ons[attr]); // TODO check cast
        }
        const hubOns = this.config.get("hub_on");
        if (hubOns) {
            for (attr in hubOns) {
                if (Object.prototype.hasOwnProperty.call(hubOns, attr)) {
                    this.hub.on(attr, hubOns[attr]); // TODO check cast
                }
            }
        }
        if (!this.startup.reason) {
            // Then a call to TogetherJS() from a button must be started TogetherJS
            this.startup.reason = "started";
        }
        if (this.require) {
            session = this.require("session").session;
            addStyle("/togetherjs.css", this.baseUrl, cacheBust);
            session.start();
            return;
        }
        // A sort of signal to session.js to tell it to actually
        // start itself (i.e., put up a UI and try to activate)
        this.startup._launch = true;
        addStyle("/togetherjs.css", this.baseUrl, cacheBust);
        const minSetting = this.config.get("useMinimizedCode");
        if (minSetting !== undefined) {
            min = !!minSetting;
        }
        const requireConfig = Object.assign({}, this.requireConfig);
        const deps = ["session", "jquery"];
        let lang = this.config.get("lang");
        // [igoryen]: We should generate this value in Gruntfile.js, based on the available translations
        const availableTranslations = {
            "en-US": true,
            "en": "en-US",
            "es": "es-BO",
            "es-BO": true,
            "ru": true,
            "ru-RU": "ru",
            "pl": "pl-PL",
            "pl-PL": true,
            "de-DE": true,
            "de": "de-DE"
        };
        if (!lang) {
            // BCP 47 mandates hyphens, not underscores, to separate lang parts
            lang = navigator.language.replace(/_/g, "-");
        }
        const translation = availableTranslations[lang];
        // TODO check if the updates of those conditions is right
        // if(/-/.test(lang) && !availableTranslations[lang]) {
        if (/-/.test(lang) && (!("lang" in availableTranslations) || !translation)) {
            lang = lang.replace(/-.*$/, '');
        }
        // if(!availableTranslations[lang]) {
        if (!("lang" in availableTranslations) || !translation) {
            lang = (_a = this.config.get("fallbackLang")) !== null && _a !== void 0 ? _a : "en-US";
        }
        // else if(availableTranslations[lang] !== true) {
        else if (translation !== true) {
            lang = translation;
        }
        this.config.call("lang", lang);
        const localeTemplates = "templates-" + lang;
        deps.splice(0, 0, localeTemplates);
        const callback = ( /*_session: TogetherJSNS.Session, _jquery: JQuery*/) => {
            if (!min) {
                this.require = require.config({ context: "togetherjs" });
                this.requireObject = require;
            }
        };
        if (!min) {
            if (typeof require == "function") {
                if (!require.config) {
                    console.warn("The global require (", require, ") is not requirejs; please use togetherjs-min.js");
                    throw new Error("Conflict with window.require");
                }
                this.require = require.config(requireConfig);
            }
        }
        if (typeof this.require == "function") {
            // This is an already-configured version of require
            this.require(deps, callback);
        }
        else {
            requireConfig.deps = deps;
            requireConfig.callback = callback;
            if (!min) {
                // TODO I really don't know what happens here... note that this is only executed if !min which means that at some point addScriptInner("/libs/require.js"); (see below) will be executed
                //@ts-expect-error weird stuff
                window.require = requireConfig;
            }
        }
        if (min) {
            addScript("/togetherjsPackage.js", this.baseUrl, cacheBust);
        }
        else {
            addScript("/libs/require.js", this.baseUrl, cacheBust);
        }
    }
    _teardown() {
        const requireObject = this.requireObject || window.require;
        // FIXME: this doesn't clear the context for min-case
        if (requireObject.s && requireObject.s.contexts) {
            delete requireObject.s.contexts.togetherjs;
        }
        this.startup = Object.assign({}, this.startupInit);
        this.running = false;
    }
    toString() {
        return "TogetherJS";
    }
    reinitialize() {
        if (this.running && typeof this.require == "function") {
            this.require(["session"], function ({ session }) {
                session.emit("reinitialize");
            });
        }
        // If it's not set, TogetherJS has not been loaded, and reinitialization is not needed
    }
    refreshUserData() {
        if (this.running && typeof this.require == "function") {
            this.require(["session"], function ({ session }) {
                session.emit("refresh-user-data");
            });
        }
    }
    _onmessage(msg) {
        const type = msg.type;
        let type2 = type;
        if (type.search(/^app\./) === 0) {
            type2 = type2.substr("app.".length);
        }
        else {
            type2 = "togetherjs." + type2;
        }
        msg.type = type2; // TODO cast!!!
        this.hub.emit(msg.type, msg); // TODO emit error
    }
    /** Use this method if you want you app to send custom messages */
    send(msg) {
        if (!this.require) {
            throw "You cannot use TogetherJS.send() when TogetherJS is not running";
        }
        const session = this.require("session").session;
        session.appSend(msg);
    }
    shareUrl() {
        if (!this.require) {
            return null;
        }
        const session = this.require("session").session;
        return session.shareUrl();
    }
    listenForShortcut() {
        const self = this;
        console.warn("Listening for alt-T alt-T to start TogetherJS");
        this.removeShortcut();
        this.listener = function (event) {
            if (event.which == 84 && event.altKey) {
                if (this.pressed) {
                    // Second hit
                    self.start();
                }
                else {
                    this.pressed = true;
                }
            }
            else {
                this.pressed = false;
            }
        };
        this.once("ready", this.removeShortcut);
        document.addEventListener("keyup", this.listener, false);
    }
    removeShortcut() {
        if (this.listener) {
            document.addEventListener("keyup", this.listener, false);
            this.listener = null;
        }
    }
    // TODO can peerCount (in the callback) really be undefined?
    checkForUsersOnChannel(address, callback) {
        if (address.search(/^https?:/i) === 0) {
            address = address.replace(/^http/i, 'ws');
        }
        const socket = new WebSocket(address);
        let gotAnswer = false;
        socket.onmessage = function (event) {
            const msg = JSON.parse(event.data);
            if (msg.type != "init-connection") {
                console.warn("Got unexpected first message (should be init-connection):", msg);
                return;
            }
            if (gotAnswer) {
                console.warn("Somehow received two responses from channel; ignoring second");
                socket.close();
                return;
            }
            gotAnswer = true;
            socket.close();
            callback(msg.peerCount);
        };
        socket.onclose = socket.onerror = function () {
            if (!gotAnswer) {
                console.warn("Socket was closed without receiving answer");
                gotAnswer = true;
                callback(undefined);
            }
        };
    }
}
// eslint-disable-next-line no-var
var TogetherJS = togetherjsMain();
function togetherjsMain() {
    const defaultStartupInit = {
        // What element, if any, was used to start the session:
        button: null,
        // The startReason is the reason TogetherJS was started.  One of:
        //   null: not started
        //   started: hit the start button (first page view)
        //   joined: joined the session (first page view)
        reason: null,
        // Also, the session may have started on "this" page, or maybe is continued
        // from a past page.  TogetherJS.continued indicates the difference (false the
        // first time TogetherJS is started or joined, true on later page loads).
        continued: false,
        // This is set to tell the session what shareId to use, if the boot
        // code knows (mostly because the URL indicates the id).
        _joinShareId: null,
        // This tells session to start up immediately (otherwise it would wait
        // for session.start() to be run)
        _launch: false
    };
    const defaultConfiguration = {
        dontShowClicks: false,
        cloneClicks: false,
        enableAnalytics: false,
        analyticsCode: "UA-",
        hubBase: null,
        getUserName: null,
        getUserColor: null,
        getUserAvatar: null,
        siteName: null,
        useMinimizedCode: undefined,
        cacheBust: true,
        on: {},
        hub_on: {},
        enableShortcut: false,
        toolName: null,
        findRoom: null,
        autoStart: false,
        suppressJoinConfirmation: false,
        suppressInvite: false,
        inviteFromRoom: null,
        storagePrefix: "togetherjs",
        includeHashInUrl: false,
        disableWebRTC: false,
        youtube: false,
        ignoreMessages: ["cursor-update", "keydown", "scroll-update"],
        ignoreForms: [":password"],
        lang: undefined,
        fallbackLang: "en-US"
    };
    const actualConfiguration = Object.assign({}, defaultConfiguration);
    const cacheBust = computeCacheBust();
    const version = computeVersion();
    let baseUrl = computeBaseUrl();
    actualConfiguration.baseUrl = baseUrl;
    const baseUrlOverrideString = localStorage.getItem("togetherjs.baseUrlOverride");
    let baseUrlOverride;
    if (baseUrlOverrideString) {
        try {
            baseUrlOverride = JSON.parse(baseUrlOverrideString);
        }
        catch (e) {
            baseUrlOverride = null;
        }
        if ((!baseUrlOverride) || baseUrlOverride.expiresAt < Date.now()) {
            // Ignore because it has expired
            localStorage.removeItem("togetherjs.baseUrlOverride");
        }
        else {
            baseUrl = baseUrlOverride.baseUrl;
            const logger = console.warn || console.log;
            logger.call(console, "Using TogetherJS baseUrlOverride:", baseUrl);
            logger.call(console, "To undo run: localStorage.removeItem('togetherjs.baseUrlOverride')");
        }
    }
    // Need this for a typesafe copy of two field with the same key between two object of the same type
    // TODO TS-IMPROVMENT
    function copyWithSameKey(key, readFrom, writeIn) {
        writeIn[key] = readFrom[key];
    }
    function copyConfig(configOverride, targetConfig) {
        const shownAny = false;
        for (const _attr in configOverride) {
            const attr = _attr;
            if (!Object.prototype.hasOwnProperty.call(configOverride, attr)) {
                continue;
            }
            if (attr == "expiresAt" || !Object.prototype.hasOwnProperty.call(configOverride, attr)) {
                continue;
            }
            if (!shownAny) {
                console.warn("Using TogetherJS configOverride");
                console.warn("To undo run: localStorage.removeItem('togetherjs.configOverride')");
            }
            copyWithSameKey(attr, configOverride, targetConfig);
            console.log("Config override:", attr, "=", configOverride[attr]);
        }
    }
    const configOverrideString = localStorage.getItem("togetherjs.configOverride");
    let configOverride = null;
    if (configOverrideString) {
        try {
            configOverride = JSON.parse(configOverrideString);
        }
        catch (e) {
            configOverride = null;
        }
        if (configOverride == null || configOverride.expiresAt < Date.now()) {
            localStorage.removeItem("togetherjs.configOverride");
        }
        else {
            copyConfig(configOverride, actualConfiguration);
        }
    }
    if (!baseUrl) {
        const scripts = document.getElementsByTagName("script");
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.search(/togetherjs(-min)?.js(\?.*)?$/) !== -1) {
                baseUrl = src.replace(/\/*togetherjs(-min)?.js(\?.*)?$/, "");
                console.warn("Detected baseUrl as", baseUrl);
                break;
            }
            else if (src && src.search(/togetherjs-min.js(\?.*)?$/) !== -1) {
                baseUrl = src.replace(/\/*togetherjs-min.js(\?.*)?$/, "");
                console.warn("Detected baseUrl as", baseUrl);
                break;
            }
        }
    }
    if (!baseUrl) {
        console.warn("Could not determine TogetherJS's baseUrl (looked for a <script> with togetherjs.js and togetherjs-min.js)");
    }
    const requireConfig = {
        context: "togetherjs",
        baseUrl: baseUrl,
        urlArgs: "bust=" + cacheBust,
        paths: {
            jquery: "libs/jquery-1.11.1.min",
            "jquery-private": "libs/jquery-private",
            walkabout: "libs/walkabout/walkabout",
            esprima: "libs/walkabout/lib/esprima",
            falafel: "libs/walkabout/lib/falafel",
            whrandom: "libs/whrandom/random"
        },
        map: {
            '*': { 'jquery': 'jquery-private' },
            'jquery-private': { 'jquery': 'jquery' }
        }
    };
    let defaultHubBase = "__hubUrl__";
    if (defaultHubBase == "__" + "hubUrl" + "__") {
        // Substitution wasn't made
        defaultHubBase = "https://ks3371053.kimsufi.com:7071";
    }
    actualConfiguration.hubBase = defaultHubBase;
    const tjsInstance = new TogetherJSClass(requireConfig, version, baseUrl, actualConfiguration, defaultStartupInit);
    window["TogetherJS"] = tjsInstance;
    /* TogetherJS.config(configurationObject)
       or: TogetherJS.config(configName, value)
  
       Adds configuration to TogetherJS.  You may also set the global variable TogetherJSConfig
       and when TogetherJS is started that configuration will be loaded.
  
       Unknown configuration values will lead to console error messages.
       */
    // This should contain the output of "git describe --always --dirty"
    // FIXME: substitute this on the server (and update make-static-client)
    tjsInstance.config.track("enableShortcut", function (enable, previous) {
        if (enable) {
            tjsInstance.listenForShortcut();
        }
        else if (previous) {
            tjsInstance.removeShortcut();
        }
    });
    // It's nice to replace this early, before the load event fires, so we conflict as little as possible with the app we are embedded in:
    const hash = location.hash.replace(/^#/, "");
    const m = /&?togetherjs=([^&]*)/.exec(hash);
    if (m) {
        tjsInstance.startup._joinShareId = m[1];
        tjsInstance.startup.reason = "joined";
        const newHash = hash.substr(0, m.index) + hash.substr(m.index + m[0].length);
        location.hash = newHash;
    }
    if (window._TogetherJSShareId) {
        // A weird hack for something the addon does, to force a shareId.
        // FIXME: probably should remove, it's a wonky feature.
        tjsInstance.startup._joinShareId = window._TogetherJSShareId;
        delete window._TogetherJSShareId;
    }
    // FIXME: can we push this up before the load event?
    // Do we need to wait at all?
    function onload() {
        if (tjsInstance.startup._joinShareId) {
            TogetherJS.start();
        }
        else if (window._TogetherJSBookmarklet) {
            delete window._TogetherJSBookmarklet;
            TogetherJS.start();
        }
        else {
            // FIXME: this doesn't respect storagePrefix:
            const key = "togetherjs-session.status";
            const valueString = sessionStorage.getItem(key);
            if (valueString) {
                const value = JSON.parse(valueString);
                if (value && value.running) {
                    tjsInstance.startup.continued = true;
                    tjsInstance.startup.reason = value.startupReason;
                    TogetherJS.start();
                }
            }
            else if (window.TogetherJSConfig_autoStart ||
                (window.TogetherJSConfig && window.TogetherJSConfig.autoStart)) {
                tjsInstance.startup.reason = "joined";
                TogetherJS.start();
            }
        }
    }
    function conditionalActivate() {
        if (window.TogetherJSConfig_noAutoStart) {
            return;
        }
        // A page can define this function to defer TogetherJS from starting
        let callToStart = window.TogetherJSConfig_callToStart;
        if (window.TogetherJSConfig && window.TogetherJSConfig.callToStart) {
            callToStart = window.TogetherJSConfig.callToStart;
        }
        if (callToStart) {
            // FIXME: need to document this:
            callToStart(onload);
        }
        else {
            onload();
        }
    }
    conditionalActivate();
    // FIXME: wait until load event to double check if this gets set?
    if (window.TogetherJSConfig_enableShortcut) {
        tjsInstance.listenForShortcut();
    }
    // For compatibility:
    return tjsInstance;
}
