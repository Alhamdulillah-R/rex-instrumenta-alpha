export namespace app {
	
	export class AppMeta {
	    name: string;
	    version: string;
	    goVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new AppMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.goVersion = source["goVersion"];
	    }
	}

}

export namespace jsonstore {
	
	export class Doc {
	    id: string;
	    name: string;
	    createdAt: number;
	    updatedAt: number;
	    size: number;
	    preview: string;
	    pinned: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Doc(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.size = source["size"];
	        this.preview = source["preview"];
	        this.pinned = source["pinned"];
	    }
	}
	export class Payload {
	    doc: Doc;
	    content: string;
	    found: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Payload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.doc = this.convertValues(source["doc"], Doc);
	        this.content = source["content"];
	        this.found = source["found"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    docs: Doc[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.docs = this.convertValues(source["docs"], Doc);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SaveResult {
	    docs: Doc[];
	    id: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.docs = this.convertValues(source["docs"], Doc);
	        this.id = source["id"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace jsontool {
	
	export class DiffOptions {
	    arrayMode: string;
	    arrayKey: string;
	
	    static createFrom(source: any = {}) {
	        return new DiffOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.arrayMode = source["arrayMode"];
	        this.arrayKey = source["arrayKey"];
	    }
	}
	export class DiffStats {
	    total: number;
	    same: number;
	    changed: number;
	    added: number;
	    removed: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.same = source["same"];
	        this.changed = source["changed"];
	        this.added = source["added"];
	        this.removed = source["removed"];
	    }
	}
	export class DiffRow {
	    path: string;
	    key: string;
	    depth: number;
	    status: string;
	    kind: string;
	    left: string;
	    right: string;
	    hasChildren: boolean;
	    childCount: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.key = source["key"];
	        this.depth = source["depth"];
	        this.status = source["status"];
	        this.kind = source["kind"];
	        this.left = source["left"];
	        this.right = source["right"];
	        this.hasChildren = source["hasChildren"];
	        this.childCount = source["childCount"];
	    }
	}
	export class DiffResult {
	    rows: DiffRow[];
	    stats: DiffStats;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rows = this.convertValues(source["rows"], DiffRow);
	        this.stats = this.convertValues(source["stats"], DiffStats);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace options {
	
	export class SecondInstanceData {
	    Args: string[];
	    WorkingDirectory: string;
	
	    static createFrom(source: any = {}) {
	        return new SecondInstanceData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Args = source["Args"];
	        this.WorkingDirectory = source["WorkingDirectory"];
	    }
	}

}

export namespace platform {
	
	export class FileResult {
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new FileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}

}

export namespace plugintool {
	
	export class Plugin {
	    id: string;
	    name: string;
	    entry: string;
	    importedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Plugin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.entry = source["entry"];
	        this.importedAt = source["importedAt"];
	    }
	}
	export class ImportResult {
	    plugins: Plugin[];
	    newId: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugins = this.convertValues(source["plugins"], Plugin);
	        this.newId = source["newId"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class RemoveResult {
	    plugins: Plugin[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new RemoveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugins = this.convertValues(source["plugins"], Plugin);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

