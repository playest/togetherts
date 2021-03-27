/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function StorageMain(util: Util) {
    var assert: typeof util.assert = util.assert;
    var Deferred = util.Deferred;
    var DEFAULT_SETTINGS: TogetherJSNS.StorageGet.Settings = {
        name: "",
        defaultName: "",
        avatar: null,
        stickyShare: null,
        color: null,
        seenIntroDialog: false,
        seenWalkthrough: false,
        dontShowRtcInfo: false
    };

    var DEBUG_STORAGE = false;

    class StorageSettings extends OnClass {
        defaults = DEFAULT_SETTINGS;

        constructor(private storageInstance: TJSStorage) {
            super();
        }

        get<K extends keyof TogetherJSNS.StorageGet.Settings>(name: K): JQueryDeferred<TogetherJSNS.StorageGet.Map[`settings.${K}`]> {
            assert(this.storageInstance.settings.defaults.hasOwnProperty(name), "Unknown setting:", name);
            const key = `settings.${name}` as const; // as keyof TogetherJSNS.StorageGet.MapForSettings;
            const value = this.storageInstance.settings.defaults[name] as unknown as TogetherJSNS.StorageGet.Map[`settings.${K}`]; // TODO is it possible to avoid the as unknown?
            return storage.get(key, value);
        }

        set<K extends keyof TogetherJSNS.StorageGet.Settings>(name: K, value: TogetherJSNS.StorageGet.Map[`settings.${K}`]) {
            assert(this.storageInstance.settings.defaults.hasOwnProperty(name), "Unknown setting:", name);
            const key = `settings.${name}` as const;
            return storage.set(key, value);
        }
    }

    class TJSStorage {
        public readonly settings: StorageSettings;

        constructor(
            private name: string,
            private storage: Storage,
            private prefix: string,
        ) {
            this.settings = new StorageSettings(this);
        }

        get<T extends keyof TogetherJSNS.StorageGet.Map>(key: T, defaultValue: TogetherJSNS.StorageGet.Map[T] | null = null) {
            var self = this;
            return Deferred<TogetherJSNS.StorageGet.Map[T]>(function(def) {
                // Strictly this isn't necessary, but eventually I want to move to something more async for the storage, and this simulates that much better.
                setTimeout(util.resolver(def, function() {
                    const prefixedKey = self.prefix + key;
                    let value: TogetherJSNS.StorageGet.Map[T] | null;
                    var valueAsString = self.storage.getItem(prefixedKey);
                    if(!valueAsString) {
                        value = defaultValue;
                        if(DEBUG_STORAGE) {
                            console.debug("Get storage", prefixedKey, "defaults to", value);
                        }
                    }
                    else {
                        value = JSON.parse(valueAsString);
                        if(DEBUG_STORAGE) {
                            console.debug("Get storage", prefixedKey, "=", value);
                        }
                    }
                    return value;
                }));
            });
        }

        set<T extends keyof TogetherJSNS.StorageGet.Map>(key: T, value?: TogetherJSNS.StorageGet.Map[T]) {
            var self = this;
            let stringyfiedValue: string | undefined;
            if(value !== undefined) {
                stringyfiedValue = JSON.stringify(value);
            }
            return Deferred<TogetherJSNS.StorageGet.Map[T]>(def => {
                const prefixedKey = self.prefix + key;
                if(stringyfiedValue === undefined) {
                    self.storage.removeItem(prefixedKey);
                    if(DEBUG_STORAGE) {
                        console.debug("Delete storage", prefixedKey);
                    }
                }
                else {
                    self.storage.setItem(prefixedKey, stringyfiedValue);
                    if(DEBUG_STORAGE) {
                        console.debug("Set storage", prefixedKey, stringyfiedValue);
                    }
                }
                setTimeout(def.resolve);
            });
        }

        clear() {
            var self = this;
            var promises: JQueryDeferred<unknown>[] = [];
            return Deferred((function(def: JQueryDeferred<unknown>) {
                self.keys().then(function(keys) {
                    assert(keys !== undefined);
                    keys.forEach(function(key) {
                        // FIXME: technically we're ignoring the promise returned by all these sets:
                        promises.push(self.set(key, undefined));
                    });
                    util.resolveMany(promises).then(function() {
                        def.resolve();
                    });
                });
            }).bind(this));
        }

        keys(prefix?: string, excludePrefix: boolean = false) {
            // Returns a list of keys, potentially with the given prefix
            var self = this;
            return Deferred<(keyof TogetherJSNS.StorageGet.Map)[]>(function(def) {
                setTimeout(util.resolver(def, function() {
                    prefix = prefix || "";
                    let result: string[] = [];
                    for(var i = 0; i < self.storage.length; i++) {
                        let key = self.storage.key(i)!; // TODO !
                        if(key.indexOf(self.prefix + prefix) === 0) {
                            var shortKey = key.substr(self.prefix.length);
                            if(excludePrefix) {
                                shortKey = shortKey.substr(prefix.length);
                            }
                            result.push(shortKey);
                        }
                    }
                    return result;
                }));
            });
        }

        toString() {
            return '[storage for ' + this.name + ']';
        }
    }

    class TJSStorageWithTab extends TJSStorage {
        constructor(
            name: string,
            storage: Storage,
            prefix: string,
            public readonly tab: TJSStorage
        ) {
            super(name, storage, prefix);
        }
    }

    var namePrefix = TogetherJS.config.get("storagePrefix");
    TogetherJS.config.close("storagePrefix");

    const tab = new TJSStorage('sessionStorage', sessionStorage, namePrefix + "-session.");
    const storage = new TJSStorageWithTab('localStorage', localStorage, namePrefix + ".", tab);

    return storage;
}

define(["util"], StorageMain);
