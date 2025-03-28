/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
define(["require", "exports", "./session", "./storage", "./templates", "./util"], function (require, exports, session_1, storage_1, templates_1, util_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.peers = exports.PeerClass = exports.Peers = exports.PeersSelf = void 0;
    //function peersMain(util: TogetherJSNS.Util, session: TogetherJSNS.Session, storage: TogetherJSNS.Storage, require: Require, templates: TogetherJSNS.Templates) {
    const assert = util_1.util.assert.bind(util_1.util);
    let CHECK_ACTIVITY_INTERVAL = 10 * 1000; // Every 10 seconds see if someone has gone idle
    let IDLE_TIME = 3 * 60 * 1000; // Idle time is 3 minutes
    const TAB_IDLE_TIME = 2 * 60 * 1000; // When you tab away, after two minutes you'll say you are idle
    let BYE_TIME = 10 * 60 * 1000; // After 10 minutes of inactivity the person is considered to be "gone"
    let ui; // TODO unpure
    require(["ui"], function (uiModule) {
        ui = uiModule.ui;
    });
    class PeersSelf extends OnClass {
        constructor(peers) {
            super();
            this.peers = peers;
            this.isSelf = true;
            this.id = session_1.session.clientId;
            this.identityId = session_1.session.identityId;
            this.status = "live";
            this.idle = "active";
            this.name = null;
            this.avatar = null;
            this.color = "#00FF00"; // TODO I added a default value, but is that ok?
            this.defaultName = util_1.util.pickRandom(PeersSelf.DEFAULT_NICKNAMES); // TODO set to a random one to avoid non-null casting but is it a valid value?
            // private loaded = false;// TODO unused
            this.isCreator = !session_1.session.isClient;
        }
        update(attrs) {
            let updatePeers = false;
            let updateIdle = false;
            const updateMsg = { type: "peer-update" }; // TODO maybe all fields in "peer-update" should be optional?
            if (typeof attrs.name == "string" && attrs.name != this.name) {
                this.name = attrs.name;
                updateMsg.name = this.name;
                if (!attrs.fromLoad) {
                    storage_1.storage.settings.set("name", this.name);
                    updatePeers = true;
                }
            }
            if (attrs.avatar && attrs.avatar != this.avatar) {
                util_1.util.assertValidUrl(attrs.avatar);
                this.avatar = attrs.avatar;
                updateMsg.avatar = this.avatar;
                if (!attrs.fromLoad) {
                    storage_1.storage.settings.set("avatar", this.avatar);
                    updatePeers = true;
                }
            }
            if (attrs.color && attrs.color != this.color) {
                this.color = attrs.color;
                updateMsg.color = this.color;
                if (!attrs.fromLoad) {
                    storage_1.storage.settings.set("color", this.color);
                    updatePeers = true;
                }
            }
            if (attrs.defaultName && attrs.defaultName != this.defaultName) {
                this.defaultName = attrs.defaultName;
                if (!attrs.fromLoad) {
                    storage_1.storage.settings.set("defaultName", this.defaultName);
                    updatePeers = true;
                }
            }
            if (attrs.status && attrs.status != this.status) {
                this.status = attrs.status;
                this.peers.emit("status-updated", this);
            }
            if (attrs.idle && attrs.idle != this.idle) {
                this.idle = attrs.idle;
                updateIdle = true;
                this.peers.emit("idle-updated", this);
            }
            this.view.update();
            if (updatePeers && !attrs.fromLoad) {
                session_1.session.emit("self-updated");
                session_1.session.send(updateMsg);
            }
            if (updateIdle && !attrs.fromLoad) {
                session_1.session.send({
                    type: "idle-status",
                    idle: this.idle
                });
            }
        }
        className(prefix = "") {
            return prefix + "self";
        }
        _loadFromSettings() {
            return util_1.util.resolveMany([
                storage_1.storage.settings.get("name"),
                storage_1.storage.settings.get("avatar"),
                storage_1.storage.settings.get("defaultName"),
                storage_1.storage.settings.get("color")
            ]).then(args => {
                let [name, avatar, defaultName, color] = args; // TODO !
                if (!defaultName) {
                    defaultName = util_1.util.pickRandom(PeersSelf.DEFAULT_NICKNAMES);
                    storage_1.storage.settings.set("defaultName", defaultName);
                }
                if (!color) {
                    color = Math.floor(Math.random() * 0xffffff).toString(16);
                    while (color.length < 6) {
                        color = "0" + color;
                    }
                    color = "#" + color;
                    storage_1.storage.settings.set("color", color);
                }
                if (!avatar) {
                    avatar = TogetherJS.baseUrl + "/images/default-avatar.png";
                }
                this.update({
                    name: name,
                    avatar: avatar,
                    defaultName: defaultName,
                    color: color,
                    fromLoad: true
                });
                this.peers._SelfLoaded.resolve();
            }); // FIXME: ignoring error
        }
        _loadFromApp() {
            // FIXME: I wonder if these should be optionally functions?
            // We could test typeof==function to distinguish between a getter and a concrete value
            const getUserName = TogetherJS.config.get("getUserName");
            const getUserColor = TogetherJS.config.get("getUserColor");
            const getUserAvatar = TogetherJS.config.get("getUserAvatar");
            let name = null;
            let color = null;
            let avatar = null;
            if (getUserName) {
                if (typeof getUserName == "string") {
                    name = getUserName;
                }
                else {
                    name = getUserName();
                }
                if (name && typeof name != "string") {
                    // FIXME: test for HTML safe?  Not that we require it, but
                    // <>'s are probably a sign something is wrong.
                    console.warn("Error in getUserName(): should return a string (got", name, ")");
                    name = null;
                }
            }
            if (getUserColor) {
                if (typeof getUserColor == "string") {
                    color = getUserColor;
                }
                else {
                    color = getUserColor();
                }
                if (color && typeof color != "string") {
                    // FIXME: would be nice to test for color-ness here.
                    console.warn("Error in getUserColor(): should return a string (got", color, ")");
                    color = null;
                }
            }
            if (getUserAvatar) {
                if (typeof getUserAvatar == "string") {
                    avatar = getUserAvatar;
                }
                else {
                    avatar = getUserAvatar();
                }
                if (avatar && typeof avatar != "string") {
                    console.warn("Error in getUserAvatar(): should return a string (got", avatar, ")");
                    avatar = null;
                }
            }
            if (name || color || avatar) {
                this.update({
                    name: name || undefined,
                    color: color || undefined,
                    avatar: avatar || undefined
                });
            }
        }
    }
    exports.PeersSelf = PeersSelf;
    PeersSelf.DEFAULT_NICKNAMES = (0, templates_1.templates)("names").innerHTML.split(/,\s*/g);
    class Peers extends OnClass {
        constructor() {
            super(...arguments);
            this._SelfLoaded = util_1.util.Deferred();
        }
        getPeer(id, message) {
            assert(id);
            let peer = PeerClass.peers[id];
            if (id === session_1.session.clientId) {
                return this.Self;
            }
            if (message && !peer) {
                peer = new PeerClass(this, id, { fromHelloMessage: message });
                return peer;
            }
            if (!peer) {
                return null;
            }
            if (message && (message.type == "hello" || message.type == "hello-back" || message.type == "peer-update")) {
                peer.updateFromHello(message);
                peer.view.update();
            }
            return PeerClass.peers[id];
        }
        getAllPeers(liveOnly = false) {
            const result = [];
            util_1.util.forEachAttr(PeerClass.peers, function (peer) {
                if (liveOnly && peer.status != "live") {
                    return;
                }
                result.push(peer);
            });
            return result;
        }
    }
    exports.Peers = Peers;
    class PeerClass {
        constructor(peers, id, attrs = {}) {
            this.peers = peers;
            this.isSelf = false;
            this.lastMessageDate = 0;
            this.hash = null;
            this.title = null;
            assert(id);
            assert(!PeerClass.peers[id]);
            this.id = id;
            this.identityId = attrs.identityId || null;
            this.status = attrs.status || "live";
            this.idle = attrs.status || "active";
            this.name = attrs.name || null;
            this.avatar = attrs.avatar || null;
            this.color = attrs.color || "#00FF00";
            this.view = ui.PeerView(this);
            this.following = attrs.following || false;
            PeerClass.peers[id] = this;
            let joined = attrs.joined || false;
            if (attrs.fromHelloMessage) {
                this.updateFromHello(attrs.fromHelloMessage);
                if (attrs.fromHelloMessage.type == "hello") {
                    joined = true;
                }
            }
            peers.emit("new-peer", this);
            if (joined) {
                this.view.notifyJoined();
            }
            this.view.update();
        }
        repr() {
            return "Peer(" + JSON.stringify(this.id) + ")";
        }
        serialize() {
            return {
                id: this.id,
                status: this.status,
                idle: this.idle,
                url: this.url,
                hash: this.hash,
                title: this.title,
                identityId: this.identityId || undefined,
                rtcSupported: this.rtcSupported,
                name: this.name || undefined,
                avatar: this.avatar,
                color: this.color,
                following: this.following
            };
        }
        destroy() {
            this.view.destroy();
            delete PeerClass.peers[this.id];
        }
        updateMessageDate() {
            if (this.idle == "inactive") {
                this.update({ idle: "active" });
            }
            if (this.status == "bye") {
                this.unbye();
            }
            this.lastMessageDate = Date.now();
        }
        updateFromHello(msg) {
            var _a;
            let urlUpdated = false;
            // var activeRTC = false; // TODO code change, unused
            let identityUpdated = false;
            if ("url" in msg && msg.url && msg.url != this.url) {
                this.url = msg.url;
                this.hash = null;
                this.title = null;
                urlUpdated = true;
            }
            if ("urlHash" in msg && msg.urlHash != this.hash) {
                this.hash = (_a = msg.urlHash) !== null && _a !== void 0 ? _a : null; // TODO there was a weird mix of hash and urlHash here (see original), check that it's ok
                urlUpdated = true;
            }
            if ("title" in msg && msg.title != this.title) {
                this.title = msg.title || null;
                urlUpdated = true;
            }
            if ("rtcSupported" in msg && msg.rtcSupported !== undefined) {
                this.rtcSupported = msg.rtcSupported;
            }
            if ("identityId" in msg && msg.identityId !== undefined) {
                this.identityId = msg.identityId;
            }
            if ("name" in msg && msg.name && msg.name != this.name) {
                this.name = msg.name;
                identityUpdated = true;
            }
            if ("avatar" in msg && msg.avatar && msg.avatar != this.avatar) {
                util_1.util.assertValidUrl(msg.avatar);
                this.avatar = msg.avatar;
                identityUpdated = true;
            }
            if ("color" in msg && msg.color && msg.color != this.color) {
                this.color = msg.color;
                identityUpdated = true;
            }
            if ("isClient" in msg && msg.isClient !== undefined) {
                this.isCreator = !msg.isClient;
            }
            if (this.status != "live") {
                this.status = "live";
                this.peers.emit("status-updated", this);
            }
            if (this.idle != "active") {
                this.idle = "active";
                this.peers.emit("idle-updated", this);
            }
            if ("rtcSupported" in msg && msg.rtcSupported) {
                this.peers.emit("rtc-supported", this);
            }
            if (urlUpdated) {
                this.peers.emit("url-updated", this);
            }
            if (identityUpdated) {
                this.peers.emit("identity-updated", this);
            }
            // FIXME: I can't decide if this is the only time we need to emit this message (and not .update() or other methods)
            if (this.following) {
                session_1.session.emit("follow-peer", this);
            }
        }
        update(attrs) {
            // FIXME: should probably test that only a couple attributes are settable particularly status and idle
            if (attrs.idle) {
                this.idle = attrs.idle;
            }
            if (attrs.status) {
                this.status = attrs.status;
            }
            this.view.update();
        }
        className(prefix = "") {
            return prefix + util_1.util.safeClassName(this.id);
        }
        bye() {
            if (this.status != "bye") {
                this.status = "bye";
                this.peers.emit("status-updated", this);
            }
            this.view.update();
        }
        unbye() {
            if (this.status == "bye") {
                this.status = "live";
                this.peers.emit("status-updated", this);
            }
            this.view.update();
        }
        nudge() {
            session_1.session.send({
                type: "url-change-nudge",
                url: location.href,
                to: this.id
            });
        }
        follow() {
            if (this.following) {
                return;
            }
            this.peers.getAllPeers().forEach(function (p) {
                if (p.following) {
                    p.unfollow();
                }
            });
            this.following = true;
            // We have to make sure we remember this, even if we change URLs:
            storeSerialization();
            this.view.update();
            session_1.session.emit("follow-peer", this);
        }
        unfollow() {
            this.following = false;
            storeSerialization();
            this.view.update();
        }
        static deserialize(peers, obj) {
            // This function is leverage the side-effect of new Peer which is adding the peer to the static list of peers
            obj.fromStorage = true;
            return new PeerClass(peers, obj.id, obj);
        }
    }
    exports.PeerClass = PeerClass;
    PeerClass.peers = {};
    function serialize() {
        const peers = [];
        util_1.util.forEachAttr(PeerClass.peers, function (peer) {
            peers.push(peer.serialize());
        });
        return { peers: peers };
    }
    function deserialize(peers, obj) {
        if (!obj) {
            return;
        }
        obj.peers.forEach(function (peer) {
            PeerClass.deserialize(peers, peer);
        });
    }
    function checkActivity(peers) {
        const ps = peers.getAllPeers();
        const now = Date.now();
        ps.forEach(function (p) {
            if (p.idle == "active" && now - p.lastMessageDate > IDLE_TIME) {
                p.update({ idle: "inactive" });
            }
            if (p.status != "bye" && now - p.lastMessageDate > BYE_TIME) {
                p.bye();
            }
        });
    }
    exports.peers = new Peers();
    let checkActivityTask = null;
    let tabIdleTimeout = null;
    // FIXME: I can't decide where this should actually go, seems weird that it is emitted and handled in the same module
    session_1.session.on("follow-peer", function (peer) {
        if (peer.url && peer.url != session_1.session.currentUrl()) {
            let url = peer.url;
            if (peer.urlHash) {
                url += peer.urlHash;
            }
            location.href = url;
        }
    });
    session_1.session.on("start", function () {
        if (exports.peers.Self) {
            return;
        }
        // peer.Self init
        exports.peers.Self = new PeersSelf(exports.peers);
        exports.peers.Self.view = ui.PeerSelfView(exports.peers.Self);
        storage_1.storage.tab.get("peerCache").then(obj => deserialize(exports.peers, obj));
        exports.peers.Self._loadFromSettings().then(function () {
            exports.peers.Self._loadFromApp();
            exports.peers.Self.view.update();
            session_1.session.emit("self-updated");
        });
    });
    session_1.session.on("refresh-user-data", function () {
        if (exports.peers.Self) {
            exports.peers.Self._loadFromApp();
        }
    });
    TogetherJS.config.track("getUserName", TogetherJS.config.track("getUserColor", TogetherJS.config.track("getUserAvatar", function () {
        if (exports.peers.Self) {
            exports.peers.Self._loadFromApp();
        }
    })));
    session_1.session.hub.on("bye", function (msg) {
        const peer = exports.peers.getPeer(msg.clientId);
        peer.bye(); // TODO we probably can't receive a bye message from ourself so it's always of type PeerClass
    });
    session_1.session.on("start", function () {
        if (checkActivityTask) {
            console.warn("Old peers checkActivityTask left over?");
            clearTimeout(checkActivityTask);
        }
        checkActivityTask = setInterval(() => checkActivity(exports.peers), CHECK_ACTIVITY_INTERVAL);
    });
    session_1.session.on("close", function () {
        util_1.util.forEachAttr(PeerClass.peers, function (peer) {
            peer.destroy();
        });
        storage_1.storage.tab.set("peerCache", undefined);
        if (checkActivityTask !== null) {
            clearTimeout(checkActivityTask);
        }
        checkActivityTask = null;
    });
    session_1.session.on("visibility-change", function (hidden) {
        if (hidden) {
            if (tabIdleTimeout) {
                clearTimeout(tabIdleTimeout);
            }
            tabIdleTimeout = setTimeout(function () {
                exports.peers.Self.update({ idle: "inactive" });
            }, TAB_IDLE_TIME);
        }
        else {
            if (tabIdleTimeout) {
                clearTimeout(tabIdleTimeout);
            }
            if (exports.peers.Self.idle == "inactive") {
                exports.peers.Self.update({ idle: "active" });
            }
        }
    });
    session_1.session.hub.on("idle-status", function (msg) {
        msg.peer.update({ idle: msg.idle });
    });
    // Pings are a straight alive check, and contain no more information:
    session_1.session.hub.on("ping", function () {
        session_1.session.send({ type: "ping-back" });
    });
    window.addEventListener("pagehide", function () {
        // FIXME: not certain if this should be tab local or not:
        storeSerialization();
    }, false);
    function storeSerialization() {
        storage_1.storage.tab.set("peerCache", serialize());
    }
    util_1.util.testExpose({
        setIdleTime: function (time) {
            IDLE_TIME = time;
            CHECK_ACTIVITY_INTERVAL = time / 2;
            if (TogetherJS.running) {
                if (checkActivityTask !== null) {
                    clearTimeout(checkActivityTask);
                }
                checkActivityTask = setInterval(() => checkActivity(exports.peers), CHECK_ACTIVITY_INTERVAL);
            }
        }
    });
    util_1.util.testExpose({
        setByeTime: function (time) {
            BYE_TIME = time;
            CHECK_ACTIVITY_INTERVAL = Math.min(CHECK_ACTIVITY_INTERVAL, time / 2);
            if (TogetherJS.running) {
                if (checkActivityTask !== null) {
                    clearTimeout(checkActivityTask);
                }
                checkActivityTask = setInterval(() => checkActivity(exports.peers), CHECK_ACTIVITY_INTERVAL);
            }
        }
    });
});
//return peers;
//define(["util", "session", "storage", "require", "templates"], peersMain);
