/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "./peers", "./session", "./storage", "./ui", "./util", "./windowing", "jquery"], function (require, exports, peers_1, session_1, storage_1, ui_1, util_1, windowing_1, jquery_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    jquery_1 = __importDefault(jquery_1);
    // WebRTC support -- Note that this relies on parts of the interface code that usually goes in ui.js
    //function webrtcMain(_require: Require, $: JQueryStatic, util: TogetherJSNS.Util, session: TogetherJSNS.Session, ui: TogetherJSNS.Ui, peers: TogetherJSNS.Peers, storage: TogetherJSNS.Storage, windowing: TogetherJSNS.Windowing) {
    const assert = util_1.util.assert.bind(util_1.util);
    session_1.session.RTCSupported = !!(window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.RTCPeerConnection);
    const mediaConstraints = {
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: false,
        }
    };
    if (window.mozRTCPeerConnection) {
        mediaConstraints.mandatory.MozDontOfferDataChannel = true;
    }
    const URL = window.webkitURL || window.URL;
    const RTCSessionDescription = window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.RTCSessionDescription;
    const RTCIceCandidate = window.mozRTCIceCandidate || window.webkitRTCIceCandidate || window.RTCIceCandidate;
    function makePeerConnection() {
        // Based roughly off: https://github.com/firebase/gupshup/blob/gh-pages/js/chat.js
        if (window.webkitRTCPeerConnection) {
            // If you have a type error here read the comment at webkitRTCPeerConnection in ts/types/backward-compat.ts
            return new webkitRTCPeerConnection(
            // TODO the key was "url" but the doc and the typing says it should be "urls", we would have liked to not update it (in the spirit of not changing the code) but it's not really possible to remove the error any other way (see backward-compat.d.ts for more explanation)
            { "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }] }, 
            // TODO fix
            // @ts-expect-error
            { "optional": [{ "DtlsSrtpKeyAgreement": true }] } // TODO search DtlsSrtpKeyAgreement in the page https://developer.mozilla.org/fr/docs/Web/API/WebRTC_API/Signaling_and_video_calling
            );
        }
        if (window.mozRTCPeerConnection) {
            return new window.mozRTCPeerConnection({ /* Or stun:124.124.124..2 ? */ "iceServers": [{ "urls": "stun:23.21.150.121" }] }, // TODO changed url to urls
            { "optional": [] });
        }
        throw new util_1.util.AssertionError("Called makePeerConnection() without supported connection");
    }
    function ensureCryptoLine(sdp) {
        if (!window.mozRTCPeerConnection) {
            return sdp;
        }
        const sdpLinesIn = sdp.split('\r\n');
        const sdpLinesOut = [];
        // Search for m line.
        for (let i = 0; i < sdpLinesIn.length; i++) {
            sdpLinesOut.push(sdpLinesIn[i]);
            if (sdpLinesIn[i].search('m=') !== -1) {
                sdpLinesOut.push("a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
            }
        }
        sdp = sdpLinesOut.join('\r\n');
        return sdp;
    }
    function getUserMedia(options, success, failure) {
        failure = failure || function (error) {
            console.error("Error in getUserMedia:", error);
        };
        (navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia).call(navigator, options, success, failure);
    }
    /****************************************
     * getUserMedia Avatar support
     */
    session_1.session.on("ui-ready", function () {
        let avatarData;
        const $preview = (0, jquery_1.default)("#togetherjs-self-avatar-preview");
        const $accept = (0, jquery_1.default)("#togetherjs-self-avatar-accept");
        const $cancel = (0, jquery_1.default)("#togetherjs-self-avatar-cancel");
        const $takePic = (0, jquery_1.default)("#togetherjs-avatar-use-camera");
        const $video = (0, jquery_1.default)("#togetherjs-avatar-video");
        const video0 = $video[0];
        const $upload = (0, jquery_1.default)("#togetherjs-avatar-upload");
        let streaming = false;
        (0, jquery_1.default)("#togetherjs-self-avatar").click(function () {
            const avatar = peers_1.peers.Self.avatar;
            if (avatar) {
                $preview.attr("src", avatar);
            }
            ui_1.ui.displayToggle("#togetherjs-avatar-edit");
        });
        if (!session_1.session.RTCSupported) {
            (0, jquery_1.default)("#togetherjs-avatar-edit-rtc").hide();
        }
        $takePic.click(function () {
            if (!streaming) {
                startStreaming();
                return;
            }
            takePicture();
        });
        function savePicture(dataUrl) {
            avatarData = dataUrl;
            $preview.attr("src", avatarData);
            $accept.attr("disabled", null);
        }
        $accept.click(function () {
            peers_1.peers.Self.update({ avatar: avatarData });
            ui_1.ui.displayToggle("#togetherjs-no-avatar-edit");
            // FIXME: these probably shouldn't be two elements:
            (0, jquery_1.default)("#togetherjs-participants-other").show();
            $accept.attr("disabled", "1");
        });
        $cancel.click(function () {
            ui_1.ui.displayToggle("#togetherjs-no-avatar-edit");
            // FIXME: like above:
            (0, jquery_1.default)("#togetherjs-participants-other").show();
        });
        function startStreaming() {
            getUserMedia({
                video: true,
                audio: false
            }, function (stream) {
                streaming = true;
                // was "video0.src = URL.createObjectURL(stream);", check that it does the same, see https://stackoverflow.com/questions/57090422/javascript-createobjecturl-url-fails-for-mediastream
                video0.srcObject = stream;
                video0.play();
            }, function (err) {
                // FIXME: should pop up help or something in the case of a user
                // cancel
                console.error("getUserMedia error:", err);
            });
        }
        function takePicture() {
            assert(streaming);
            let height = video0.videoHeight;
            let width = video0.videoWidth;
            width = width * (session_1.session.AVATAR_SIZE / height);
            height = session_1.session.AVATAR_SIZE;
            const canvas0 = document.createElement("canvas");
            canvas0.height = session_1.session.AVATAR_SIZE;
            canvas0.width = session_1.session.AVATAR_SIZE;
            const context = canvas0.getContext("2d"); // ! is ok because the first call to getContext can't fail if it's "2d"
            context.arc(session_1.session.AVATAR_SIZE / 2, session_1.session.AVATAR_SIZE / 2, session_1.session.AVATAR_SIZE / 2, 0, Math.PI * 2);
            context.closePath();
            context.clip();
            context.drawImage(video0, (session_1.session.AVATAR_SIZE - width) / 2, 0, width, height);
            savePicture(canvas0.toDataURL("image/png"));
        }
        $upload.on("change", function () {
            const reader = new FileReader();
            reader.onload = function () {
                // FIXME: I don't actually know it's JPEG, but it's probably a good enough guess:
                const url = "data:image/jpeg;base64," + util_1.util.blobToBase64(this.result); // TODO !
                convertImage(url, function (result) {
                    savePicture(result);
                });
            };
            reader.onerror = function () {
                console.error("Error reading file:", this.error);
            };
            reader.readAsArrayBuffer(this.files[0]);
        });
        function convertImage(imageUrl, callback) {
            const canvas = document.createElement("canvas");
            canvas.height = session_1.session.AVATAR_SIZE;
            canvas.width = session_1.session.AVATAR_SIZE;
            const context = canvas.getContext("2d"); // ! is ok because the first call to getContext can't fail if it's "2d"
            const img = new Image();
            img.src = imageUrl;
            // Sometimes the DOM updates immediately to call
            // naturalWidth/etc, and sometimes it doesn't; using setTimeout
            // gives it a chance to catch up
            setTimeout(function () {
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;
                width = width * (session_1.session.AVATAR_SIZE / height);
                height = session_1.session.AVATAR_SIZE;
                context.drawImage(img, 0, 0, width, height);
                callback(canvas.toDataURL("image/png"));
            });
        }
    });
    /****************************************
     * RTC support
     */
    function audioButton(selector) {
        ui_1.ui.displayToggle(selector);
        if (selector == "#togetherjs-audio-incoming") {
            (0, jquery_1.default)("#togetherjs-audio-button").addClass("togetherjs-animated").addClass("togetherjs-color-alert");
        }
        else {
            (0, jquery_1.default)("#togetherjs-audio-button").removeClass("togetherjs-animated").removeClass("togetherjs-color-alert");
        }
    }
    session_1.session.on("ui-ready", function () {
        (0, jquery_1.default)("#togetherjs-audio-button").click(function () {
            if ((0, jquery_1.default)("#togetherjs-rtc-info").is(":visible")) {
                windowing_1.windowing.hide();
                return;
            }
            if (session_1.session.RTCSupported) {
                enableAudio();
            }
            else {
                windowing_1.windowing.show("#togetherjs-rtc-not-supported");
            }
        });
        if (!session_1.session.RTCSupported) {
            audioButton("#togetherjs-audio-unavailable");
            return;
        }
        audioButton("#togetherjs-audio-ready");
        let audioStream = null;
        let accepted = false;
        const connected = false;
        const $audio = (0, jquery_1.default)("#togetherjs-audio-element");
        let offerSent = null;
        let offerReceived = null;
        let offerDescription = false;
        let answerSent = null;
        let answerReceived = null;
        let answerDescription = false;
        let _connection = null;
        let iceCandidate = null;
        function enableAudio() {
            accepted = true;
            storage_1.storage.settings.get("dontShowRtcInfo").then(function (dontShow) {
                if (!dontShow) {
                    windowing_1.windowing.show("#togetherjs-rtc-info");
                }
            });
            if (!audioStream) {
                startStreaming(connect);
                return;
            }
            if (!connected) {
                connect();
            }
            toggleMute();
        }
        ui_1.ui.container.find("#togetherjs-rtc-info .togetherjs-dont-show-again").change(function () {
            storage_1.storage.settings.set("dontShowRtcInfo", this.checked);
        });
        function error(...args) {
            console.warn(args);
            let s = "";
            for (let i = 0; i < args.length; i++) {
                if (s) {
                    s += " ";
                }
                const a = args[i];
                if (typeof a == "string") {
                    s += a;
                }
                else {
                    let repl;
                    try {
                        repl = JSON.stringify(a);
                    }
                    catch (e) {
                        repl = "" + a;
                    }
                    s += repl;
                }
            }
            audioButton("#togetherjs-audio-error");
            // FIXME: this title doesn't seem to display?
            (0, jquery_1.default)("#togetherjs-audio-error").attr("title", s);
        }
        function startStreaming(callback) {
            /** @deprecated https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getUserMedia */
            getUserMedia({
                video: false,
                audio: true
            }, function (stream) {
                audioStream = stream;
                attachMedia("#togetherjs-local-audio", stream);
                if (callback) {
                    callback();
                }
            }, function (err) {
                // TODO this code can't work. getUserMedia gets a MediaStreamError but this callback act as if it was receiving a MediaError (https://developer.mozilla.org/en-US/docs/Web/API/MediaError) where a code of 1 would mean "The fetching of the associated resource was aborted by the user's request". I know that it can't work because MediaStreamError doesn't have a `code` field.
                // FIXME: handle cancel case
                if (err && err.code == 1) { // TODO does .code actually exists? Maybe it's a MediaError and not a MediaStreamError
                    // User cancel
                    return;
                }
                error("getUserMedia error:", err);
            });
        }
        function attachMedia(element, media) {
            element = (0, jquery_1.default)(element)[0];
            console.log("Attaching", media, "to", element);
            if (window.mozRTCPeerConnection) {
                element.mozSrcObject = media;
                element.play();
            }
            else {
                element.autoplay = true;
                // was "element.src = URL.createObjectURL(media);", check that it does the same, see https://stackoverflow.com/questions/57090422/javascript-createobjecturl-url-fails-for-mediastream
                element.srcObject = media;
            }
        }
        function getConnection() {
            assert(audioStream);
            if (_connection) {
                return _connection;
            }
            try {
                _connection = makePeerConnection();
            }
            catch (e) {
                error("Error creating PeerConnection:", e);
                throw e;
            }
            _connection.onaddstream = function (event) {
                console.log("got event", event.type, event);
                if (event.stream == null) {
                    console.error("stream was null in the event", event);
                    return;
                }
                attachMedia($audio, event.stream);
                audioButton("#togetherjs-audio-active");
            };
            _connection.onstatechange = function () {
                // FIXME: this doesn't seem to work:
                // Actually just doesn't work on Firefox
                assert(_connection !== null); // TODO assert added
                console.log("state change", _connection === null || _connection === void 0 ? void 0 : _connection.readyState);
                if (_connection.readyState == "closed") {
                    audioButton("#togetherjs-audio-ready");
                }
            };
            _connection.onicecandidate = function (event) {
                if (event.candidate) {
                    session_1.session.send({
                        type: "rtc-ice-candidate",
                        candidate: {
                            sdpMLineIndex: event.candidate.sdpMLineIndex,
                            sdpMid: event.candidate.sdpMid,
                            candidate: event.candidate.candidate
                        }
                    });
                }
            };
            _connection.addStream(audioStream);
            return _connection;
        }
        function addIceCandidate() {
            if (iceCandidate) {
                console.log("adding ice", iceCandidate);
                assert(_connection !== null); // TODO assert added
                _connection.addIceCandidate(new RTCIceCandidate(iceCandidate));
            }
        }
        function connect() {
            const connection = getConnection();
            if (offerReceived && (!offerDescription)) {
                connection.setRemoteDescription(new RTCSessionDescription({
                    type: "offer",
                    sdp: offerReceived.toString() // TODO added toString to follow rules here https://developer.mozilla.org/en-US/docs/Web/API/RTCSessionDescription/RTCSessionDescription
                    // using RTCSessionDescription constructor is @deprecated
                }), // TODO setRemoteDescription returns a promise so the 2 callbacks should probably be used in a .then()
                //).then( // TODO TRY like this for example
                function () {
                    offerDescription = true;
                    addIceCandidate();
                    connect();
                }, function (err) {
                    error("Error doing RTC setRemoteDescription:", err);
                });
                return;
            }
            if (!(offerSent || offerReceived)) {
                connection.createOffer(function (offer) {
                    console.log("made offer", offer);
                    if (offer.sdp !== undefined) { // TODO if add for typecheck
                        offer.sdp = ensureCryptoLine(offer.sdp);
                    }
                    connection.setLocalDescription(offer, 
                    //).then( // TODO toggle to switch to promise mode (the new api)
                    function () {
                        session_1.session.send({
                            type: "rtc-offer",
                            offer: offer.sdp // TODO !
                        });
                        offerSent = offer;
                        audioButton("#togetherjs-audio-outgoing");
                    }, function (err) {
                        error("Error doing RTC setLocalDescription:", err);
                    }, mediaConstraints);
                }, function (err) {
                    error("Error doing RTC createOffer:", err);
                });
            }
            else if (!(answerSent || answerReceived)) {
                // FIXME: I might have only needed this due to my own bugs, this might not actually time out
                const timeout = setTimeout(function () {
                    if (!answerSent) {
                        error("createAnswer Timed out; reload or restart browser");
                    }
                }, 2000);
                connection.createAnswer(function (answer) {
                    if (answer.sdp !== undefined) { // TODO if added for typecheck
                        answer.sdp = ensureCryptoLine(answer.sdp);
                    }
                    clearTimeout(timeout);
                    connection.setLocalDescription(answer, 
                    //).then(
                    function () {
                        var _a;
                        session_1.session.send({
                            type: "rtc-answer",
                            answer: (_a = answer.sdp) !== null && _a !== void 0 ? _a : "" // TODO added ?? ""
                        });
                        answerSent = answer;
                    }, function (err) {
                        clearTimeout(timeout);
                        error("Error doing RTC setLocalDescription:", err);
                    }, mediaConstraints);
                }, function (err) {
                    error("Error doing RTC createAnswer:", err);
                });
            }
        }
        function toggleMute() {
            // FIXME: implement.  Actually, wait for this to be implementable - currently
            // muting of localStreams isn't possible
            // FIXME: replace with hang-up?
        }
        session_1.session.hub.on("rtc-offer", function (msg) {
            if (offerReceived || answerSent || answerReceived || offerSent) {
                abort();
            }
            offerReceived = msg.offer;
            if (!accepted) {
                audioButton("#togetherjs-audio-incoming");
                return;
            }
            function run() {
                const connection = getConnection();
                connection.setRemoteDescription(new RTCSessionDescription({
                    type: "offer",
                    sdp: offerReceived === null || offerReceived === void 0 ? void 0 : offerReceived.toString() // TODO check that the .toString() that was added does not cause any problem
                }), // TODO this returns a promise so the 2 callbacks should probably be used in a .then()
                function () {
                    offerDescription = true;
                    addIceCandidate();
                    connect();
                }, function (err) {
                    error("Error doing RTC setRemoteDescription:", err);
                });
            }
            if (!audioStream) {
                startStreaming(run);
            }
            else {
                run();
            }
        });
        session_1.session.hub.on("rtc-answer", function (msg) {
            if (answerSent || answerReceived || offerReceived || (!offerSent)) {
                abort();
                // Basically we have to abort and try again.  We'll expect the other
                // client to restart when appropriate
                session_1.session.send({ type: "rtc-abort" });
                return;
            }
            answerReceived = msg.answer;
            assert(offerSent);
            assert(audioStream);
            const connection = getConnection();
            connection.setRemoteDescription(new RTCSessionDescription({
                type: "answer",
                sdp: answerReceived.toString() // TODO check that the .toString() that was added does not cause any problem
            }), // TODO this returns a promise so the 2 callbacks should probably be used in a .then()
            //).then(
            function () {
                answerDescription = true;
                // FIXME: I don't think this connect is ever needed?
                connect();
            }, function (err) {
                error("Error doing RTC setRemoteDescription:", err);
            });
        });
        session_1.session.hub.on("rtc-ice-candidate", function (msg) {
            iceCandidate = msg.candidate;
            if (offerDescription || answerDescription) {
                addIceCandidate();
            }
        });
        session_1.session.hub.on("rtc-abort", function () {
            abort();
            if (!accepted) {
                return;
            }
            if (!audioStream) {
                startStreaming(function () {
                    connect();
                });
            }
            else {
                connect();
            }
        });
        session_1.session.hub.on("hello", function () {
            // FIXME: displayToggle should be set due to _connection.onstatechange, but that's not working, so instead:
            audioButton("#togetherjs-audio-ready");
            if (accepted && (offerSent || answerSent)) {
                abort();
                connect();
            }
        });
        function abort() {
            answerSent = answerReceived = offerSent = offerReceived = null;
            answerDescription = offerDescription = false;
            _connection = null;
            $audio[0].removeAttribute("src");
        }
    });
});
//define(["require", "jquery", "util", "session", "ui", "peers", "storage", "windowing"], webrtcMain);
