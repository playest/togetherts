/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */

function isJQuery(o: unknown): o is JQuery {
    return o instanceof jQuery;
}

define(["util", "jquery"], function (util: Util, $: JQueryStatic) {
    let assert: typeof util.assert = util.assert;

    let elementFinder = class ElementFinder {
        
        ignoreElement(element: HTMLElement | JQuery) {
            let el: Node | JQuery | null = element;
            if (isJQuery(el)) {
                el = el[0];
            }
            while (el) {
                if ($(el).hasClass("togetherjs")) {
                    return true;
                }
                el = el.parentNode;
            }
            return false;
        }
        
        elementLocation(element: HTMLElement | JQuery | Document): string {
            assert(element !== null, "Got null element");
            let el: HTMLElement | JQuery | Document = element;

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

            let parent = el.parentNode as HTMLElement;
            if ((! parent) || parent == el) {
                console.warn("elementLocation(", el, ") has null parent");
                throw new Error("No locatable parent found");
            }
            let parentLocation = this.elementLocation(parent);
            let children = parent.childNodes;
            let _len = children.length;
            let index = 0;
            for (let i=0; i<_len; i++) {
                let child = children[i] as HTMLElement;
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
            return parentLocation + ":nth-child(" + (index+1) + ")";
        }
        
        static CannotFind = class CannotFind {
            constructor(location, reason, context) {
                this.prefix = "";
                this.location = location;
                this.reason = reason;
                this.context = context;
            }
            toString() {
                var loc;
                try {
                    loc = ElementFinder.elementLocation(this.context);
                } catch (e) {
                    loc = this.context;
                }
                return ( "[CannotFind " + this.prefix + "(" + this.location + "): " + this.reason + " in " + loc + "]");
            }
        };
        
        findElement(loc, container) {
            // FIXME: should this all just be done with document.querySelector()?
            // But no!  We can't ignore togetherjs elements with querySelector.
            // But maybe!  We *could* make togetherjs elements less obtrusive?
            container = container || document;
            var el, rest;
            if (loc === "body") {
                return document.body;
            } else if (loc === "head") {
                return document.head;
            } else if (loc === "document") {
                return document;
            } else if (loc.indexOf("body") === 0) {
                el = document.body;
                try {
                    return this.findElement(loc.substr(("body").length), el);
                } catch (e) {
                    if (e instanceof ElementFinder.CannotFind) {
                        e.prefix = "body" + e.prefix;
                    }
                    throw e;
                }
            } else if (loc.indexOf("head") === 0) {
                el = document.head;
                try {
                    return findElement(loc.substr(("head").length), el);
                } catch (e) {
                    if (e instanceof elementFinder.CannotFind) {
                        e.prefix = "head" + e.prefix;
                    }
                    throw e;
                }
            } else if (loc.indexOf("#") === 0) {
                var id;
                loc = loc.substr(1);
                if (loc.indexOf(":") === -1) {
                    id = loc;
                    rest = "";
                } else {
                    id = loc.substr(0, loc.indexOf(":"));
                    rest = loc.substr(loc.indexOf(":"));
                }
                el = document.getElementById(id);
                if (! el) {
                    throw new ElementFinder.CannotFind("#" + id, "No element by that id", container);
                }
                if (rest) {
                    try {
                        return findElement(rest, el);
                    } catch (e) {
                        if (e instanceof elementFinder.CannotFind) {
                            e.prefix = "#" + id + e.prefix;
                        }
                        throw e;
                    }
                } else {
                    return el;
                }
            } else if (loc.indexOf(":nth-child(") === 0) {
                loc = loc.substr((":nth-child(").length);
                if (loc.indexOf(")") == -1) {
                    throw "Invalid location, missing ): " + loc;
                }
                var num = loc.substr(0, loc.indexOf(")"));
                num = parseInt(num, 10);
                var count = num;
                loc = loc.substr(loc.indexOf(")") + 1);
                var children = container.childNodes;
                el = null;
                for (var i=0; i<children.length; i++) {
                    var child = children[i];
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
                if (! el) {
                    throw new ElementFinder.CannotFind(":nth-child(" + num + ")", "container only has " + (num - count) + " elements", container);
                }
                if (loc) {
                    try {
                        return elementFinder.findElement(loc, el);
                    } catch (e) {
                        if (e instanceof elementFinder.CannotFind) {
                            e.prefix = ":nth-child(" + num + ")" + e.prefix;
                        }
                        throw e;
                    }
                } else {
                    return el;
                }
            } else {
                throw new ElementFinder.CannotFind(loc, "Malformed location", container);
            }
        };
        
        elementByPixel(height) {
            let self = this;
            /* Returns {location: "...", offset: pixels}
            
            To get the pixel position back, you'd do:
            $(location).offset().top + offset
            */
            function search(start, height) {
                var last = null;
                var children = start.children();
                children.each(function () {
                    var el = $(this);
                    if (el.hasClass("togetherjs") || el.css("position") == "fixed" || ! el.is(":visible")) {
                        return;
                    }
                    if (el.offset().top > height) {
                        return false;
                    }
                    last = el;
                });
                if ((! children.length) || (! last)) {
                    // There are no children, or only inapplicable children
                    return {
                        location: self.elementLocation(start[0]),
                        offset: height - start.offset().top,
                        absoluteTop: height,
                        documentHeight: $(document).height()
                    };
                }
                return search(last, height);
            }
            return search($(document.body), height);
        }
        
        pixelForPosition(position) {
            /* Inverse of elementFinder.elementByPixel */
            if (position.location == "body") {
                return position.offset;
            }
            var el;
            try {
                el = this.findElement(position.location);
            } catch (e) {
                if (e instanceof elementFinder.CannotFind && position.absoluteTop) {
                    // We don't trust absoluteTop to be quite right locally, so we adjust
                    // for the total document height differences:
                    var percent = position.absoluteTop / position.documentHeight;
                    return $(document).height() * percent;
                }
                throw e;
            }
            var top = $(el).offset().top;
            // FIXME: maybe here we should test for sanity, like if an element is
            // hidden.  We can use position.absoluteTop to get a sense of where the
            // element roughly should be.  If the sanity check failed we'd use
            // absoluteTop
            return top + position.offset;
        }
    }
    
    return new elementFinder();
});
