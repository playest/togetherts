/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "jquery"], function (require, exports, jquery_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.elementFinder = exports.ElementFinder = void 0;
    jquery_1 = __importDefault(jquery_1);
    function isJQuery(o) {
        return o instanceof jquery_1.default;
    }
    class CannotFind {
        constructor(location, reason, context) {
            this.location = location;
            this.reason = reason;
            this.context = context;
            this.prefix = "";
        }
        toString() {
            let loc;
            try {
                loc = "loc"; //elementFinder.elementLocation(this.context);
            }
            catch (e) {
                loc = this.context;
            }
            return ("[CannotFind " + this.prefix + "(" + this.location + "): " + this.reason + " in " + loc + "]");
        }
    }
    class ElementFinder {
        ignoreElement(element) {
            let el = element;
            if (isJQuery(el)) {
                el = el[0];
            }
            while (el) {
                if ((0, jquery_1.default)(el).hasClass("togetherjs")) {
                    return true;
                }
                el = el.parentNode;
            }
            return false;
        }
        elementLocation(element) {
            //assert(element !== null, "Got null element");
            let el = element;
            if (0 in el && "attr" in el && el[0].nodeType == 1) {
                // Or a jQuery element not made by us
                el = el[0];
            }
            if (isJQuery(el)) {
                // a jQuery element
                el = el[0];
            }
            if (el === document || el instanceof Document) {
                return "document";
            }
            if (el.id) {
                return "#" + el.id;
            }
            if (el.tagName == "BODY") {
                return "body";
            }
            if (el.tagName == "HEAD") {
                return "head";
            }
            const parent = el.parentNode;
            if ((!parent) || parent == el) {
                console.warn("elementLocation(", el, ") has null parent");
                throw new Error("No locatable parent found");
            }
            const parentLocation = this.elementLocation(parent);
            const children = parent.childNodes;
            const _len = children.length;
            let index = 0;
            for (let i = 0; i < _len; i++) {
                const child = children[i];
                if (child == el) {
                    break;
                }
                if (child.nodeType == document.ELEMENT_NODE) {
                    if (child.className.indexOf("togetherjs") != -1) {
                        // Don't count our UI
                        continue;
                    }
                    // Don't count text or comments
                    index++;
                }
            }
            return parentLocation + ":nth-child(" + (index + 1) + ")";
        }
        findElement(loc, container) {
            // FIXME: should this all just be done with document.querySelector()?
            // But no!  We can't ignore togetherjs elements with querySelector.
            // But maybe!  We *could* make togetherjs elements less obtrusive?
            container = container || document;
            let el;
            let rest;
            if (loc === "body") {
                return document.body;
            }
            else if (loc === "head") {
                return document.head;
            }
            else if (loc === "document") {
                return document.documentElement;
            }
            else if (loc.indexOf("body") === 0) {
                el = document.body;
                try {
                    return this.findElement(loc.substr(("body").length), el);
                }
                catch (e) {
                    if (e instanceof CannotFind) {
                        e.prefix = "body" + e.prefix;
                    }
                    throw e;
                }
            }
            else if (loc.indexOf("head") === 0) {
                el = document.head;
                try {
                    return this.findElement(loc.substr(("head").length), el);
                }
                catch (e) {
                    if (e instanceof CannotFind) {
                        e.prefix = "head" + e.prefix;
                    }
                    throw e;
                }
            }
            else if (loc.indexOf("#") === 0) {
                let id;
                loc = loc.substr(1);
                if (loc.indexOf(":") === -1) {
                    id = loc;
                    rest = "";
                }
                else {
                    id = loc.substr(0, loc.indexOf(":"));
                    rest = loc.substr(loc.indexOf(":"));
                }
                el = document.getElementById(id);
                if (!el) {
                    throw new CannotFind("#" + id, "No element by that id", container);
                }
                if (rest) {
                    try {
                        return this.findElement(rest, el);
                    }
                    catch (e) {
                        if (e instanceof CannotFind) {
                            e.prefix = "#" + id + e.prefix;
                        }
                        throw e;
                    }
                }
                else {
                    return el;
                }
            }
            else if (loc.indexOf(":nth-child(") === 0) {
                loc = loc.substr((":nth-child(").length);
                if (loc.indexOf(")") == -1) {
                    throw "Invalid location, missing ): " + loc;
                }
                const num = parseInt(loc.substr(0, loc.indexOf(")")), 10);
                let count = num;
                loc = loc.substr(loc.indexOf(")") + 1);
                const children = container.childNodes;
                el = null;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (child.nodeType == document.ELEMENT_NODE) {
                        if (child.className.indexOf("togetherjs") != -1) {
                            continue;
                        }
                        count--;
                        if (count === 0) {
                            // this is the element
                            el = child;
                            break;
                        }
                    }
                }
                if (!el) {
                    throw new CannotFind(":nth-child(" + num + ")", "container only has " + (num - count) + " elements", container);
                }
                if (loc) {
                    try {
                        return this.findElement(loc, el);
                    }
                    catch (e) {
                        if (e instanceof CannotFind) {
                            e.prefix = ":nth-child(" + num + ")" + e.prefix;
                        }
                        throw e;
                    }
                }
                else {
                    return el;
                }
            }
            else {
                throw new CannotFind(loc, "Malformed location", container);
            }
        }
        elementByPixel(height) {
            const self = this;
            /* Returns {location: "...", offset: pixels}
            
            To get the pixel position back, you'd do:
            $(location).offset().top + offset
            */
            function search(start, height) {
                var _a, _b;
                let last = null;
                const children = start.children();
                children.each(function () {
                    const el = (0, jquery_1.default)(this);
                    if (el.hasClass("togetherjs") || el.css("position") == "fixed" || !el.is(":visible")) {
                        return;
                    }
                    const offset = el.offset();
                    if (offset && offset.top > height) {
                        return false;
                    }
                    last = el;
                    return;
                });
                if ((!children.length) || (!last)) {
                    // There are no children, or only inapplicable children
                    const start_offset_top = (_b = (_a = start.offset()) === null || _a === void 0 ? void 0 : _a.top) !== null && _b !== void 0 ? _b : 0;
                    return {
                        location: self.elementLocation(start[0]),
                        offset: height - start_offset_top,
                        absoluteTop: height,
                        documentHeight: (0, jquery_1.default)(document).height()
                    };
                }
                return search(last, height);
            }
            return search((0, jquery_1.default)(document.body), height);
        }
        pixelForPosition(position) {
            /* Inverse of elementFinder.elementByPixel */
            if (position.location == "body") {
                return position.offset;
            }
            let el;
            try {
                el = this.findElement(position.location);
                const el_offset = (0, jquery_1.default)(el).offset();
                if (el_offset === undefined) {
                    throw new Error("pixelForPosition called on element without offset");
                }
                // FIXME: maybe here we should test for sanity, like if an element is
                // hidden.  We can use position.absoluteTop to get a sense of where the
                // element roughly should be.  If the sanity check failed we'd use
                // absoluteTop
                return el_offset.top + position.offset;
            }
            catch (e) {
                if (e instanceof CannotFind && position.absoluteTop) {
                    // We don't trust absoluteTop to be quite right locally, so we adjust
                    // for the total document height differences:
                    const percent = position.absoluteTop / position.documentHeight;
                    return (0, jquery_1.default)(document).height() * percent;
                }
                throw e;
            }
        }
    }
    exports.ElementFinder = ElementFinder;
    exports.elementFinder = new ElementFinder();
});
//define(["util", "jquery"], elementFinderMain);
