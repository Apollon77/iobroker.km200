/**
 *
 * template adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "template",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js template Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@template.com>"
 *          ]
 *          "desc":         "template adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var request =       require('request');
var async =         require('async');
var util =          require('util');
var http =          require('http');

var EventEmitter =  require('events').EventEmitter;

function objToString(obj,level) {    return  util.inspect(obj, false, level || 2, false).replace(/\n/g,' ');}

function safeJson(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 


function MyXS1() {


    if (!(this instanceof MyXS1)) return new MyXS1();
//    if (!url) throw 'MyXS1 url option not set!';
    EventEmitter.call(this);

    this.url = null;
    this.actuators = null;
    this.sensors = null;
    this.names = {};
    this.creq = null;
    this.resp = null;
    this.connected = false;

    var that = this;
    
    var types = { switch:"boolean", timerswitch:"boolean" };

    that.disconnect = function(callback) {
        if(!this.connected) {
            that.emit("error","XS1 disconnect called on not connected device!");
            return;
        }
        if (that.creq)
            that.creq.abort();
        that.connected = false;
        that.resp = null;
        that.creq = null;
//        that.emit('disconnected');
    };

    that.connect = function(callback,msg) {
        var url = that.url + "control?callback=cb&cmd=subscribe&format=txt&x="+Date.now();
        if (that.connected) {
            that.emit("error","XS1 connect called on already connected device!");
            return;
        }
        try {
            that.creq = http.get(url,function(response) {
                that.resp = response;
                if (response.statusCode!=200) {
                    that.emit('error',response.statusCode);
                    return callback && callback("Bad status code for connection:"+response.statusCode,msg);
                }
                response.setEncoding('utf8');
                
    //            that.emit('msg','response',response.statusCode);
                
                response.on('data',function(buf) {
                    var b = buf.trim().split(' ');
                    if (b.length<14) 
                        return that.emit("error", {err:"Invalid response from XS1 data",value:buf},"warn");
                    var data = {};
                    var st = {'A':"Actuator",'S':"Sensor"};
                    try {
                        data.ts = parseInt(b[0]) * 1000;
                        data.stype = st[b[9]];
                        data.number = b[10];
                        data.name = b[11];
                        data.vtype = b[12];
                        data.val = parseFloat(b[13]);
                        if (types[data.vtype]==="boolean")
                            data.val = data.val>0;
                    } catch(e) {
                        return that.emit("error", {err:"Cannot read response from XS1 data",value:buf,arrcode:e},"warn");
                    }
                    that.emit('data',data); 
                });    
                response.on('error',function(err) {
                    that.emit('error',err,'error resp in XS1');
    //                that.emit('msg','error resp',err); 
                });    
                response.on('end',function() {
                    that.emit('msg','end resp'); 
                    that.creq = null;
                    that.resp = null;
                    that.connected = false;
                    that.emit('disconnected'); 
                });    
                that.connected = true;
                that.emit('connected',response.statusCode);
                callback && callback(null,msg);
            });
        
            that.creq.on('aborted',function() {
                that.connected = false;
                that.creq = null;
                that.resp = null;
                that.emit('msg','aborted creq',that.connected); 
            });    
               
            that.creq.on('error',function(err) {
                that.emit('error',err,'error creq in XS1'); 
            });    
        } catch(e) {
            if (that.creq)
                that.creq.abort();
            that.connected = false;
            that.resp = null;
            that.creq = null;
            that.emit('error',e);
            callback && callback(e,msg);
        }
           
     
    };
    
    that.sendXS1 = function(command,callback) {
        var link = that.url+"control?callback=cb&x=" + Date.now() + "&cmd="+command;
        async.retry({times:5,interval:1000}, function(callb,data) {
            request(link, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var obj = safeJson(body.trim().slice(3,-1));
                    if (obj.error >"") {
                        that.emit('error',"sendXS1 returned ERROR: " + obj.error + ", "+ link);
                        return callb(obj.error,[]);
                    } else {
                        var t =null;
                        if (/actuator/.test(command))
                            t = "actuator";
                        if (/sensor/.test(command))
                            t = "sensor";
                        if (!t) {
                            that.emit('error',obj.type + "= unknown object result from XS1");
                            obj = [];
                        } else {
                            obj = obj[t];    
                        }
                    
                        if (Array.isArray(obj)) {
                            var na =[];
                            for (var key=0;key < obj.length;++key) {
                                if (obj[key].type != "disabled") {
                                    obj[key].styp = t;
                                    obj[key].lname = t+"."+obj[key].name;
                                    obj[key].number = key+1;
                                    na.push(obj[key]);
                                }
                            }
                            obj = na;
                        }
                    }
                    callb(null,obj);
                } else {
                    that.emit('error'," Error in request, will retry, "+error || response.statusCode);
                    callb(error || response.statusCode,body);
                }
            });
        }, function(err,data) {
            if (err) {
                that.emit('error',err);
                data = [];
            } 
            that.emit('xs1response',data);
            callback && callback(err,data); 
        });

    };

    that.getState = function(name,callback) {
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        
        that.sendXS1("get_state_"+styp+"&number="+id, function(err,obj) {
            callback && callback(err,obj);
        });
        
    };

    that.setState = function(name,value,callback) {
        var fn = that.getName(name);
        if (!fn)
            return that.emit("error","MyXS1.setState Name not found: "+name);
        var id = that.getNumber(fn);
        var styp = that.getStyp(fn);
        var val = parseFloat(value);
        
        if (styp==="actuator") {
            if (typeof value === "boolean") {
                val = value ? 100 : 0;
            } else if (typeof value === "number") {
                val = value>100 ? 100 : (value<=0 ? 0 : parseInt(value));
            } else val = parseInt(value);
        }

        that.sendXS1("set_state_"+styp+"&number="+id+"&value="+val, function(err,obj) {
            callback && callback(err,obj);
        });
        
    };

    that.startXS1 = function(url,callback) {
        if (!url || !url.startsWith("http"))
            return that.emit('error', 'not a valid URL for XS1:'+url);

        if (url.substr(-1,1) !== '/')
             url =  url + '/'; 

        that.url = url;

        
        that.sendXS1("get_list_actuators",function(err,obj) {
            if (err)
                return callback && callback(err,null);
            that.names = {};
            that.actuators =  obj;
            that.sendXS1("get_list_sensors",function(err,obj) {
                if (err)
                    return callback && callback(err,null);
                that.sensors = obj;
                var all = obj.concat(that.actuators);
                for (var i=0;i<all.length;++i) {
                    var val = all[i];
                    if (val.lname) 
                        that.names[val.lname] = val;
                }
                that.connect(callback,all);
           });
        });  
    };


    that.getName = function(name) {
        if (that.names[name]!== undefined)
            return name;
        if (that.names["sensor."+name] !== undefined)
            return "sensor."+name;
        if(that.names["actuator."+name] !== undefined)
            return "actuator."+name;
        return null;
    };

    that.getStyp = function(name) {
        return that.names[that.getName(name)].styp;
    };
    
    that.getNumber = function(name) {
        return that.names[that.getName(name)].number || 0;
    };
    
    that.getHistory = function(name,callback,from_s,to_s) {
        if (!name && ! callback)
            return that.emit("error","MyXS1.getHistory argument error:("+name+","+callback+","+from_s+","+to_s);
        var nn = that.getName(name);
        if (!nn)
            return that.emit("error","MyXS1.getHistory id not found:("+name+","+callback+","+from_s+","+to_s);
        from_s = Math.floor((from_s || Date.now()-1000*60*60*24)/1000);
        to_s = Math.floor((to_s || Date.now())/1000);
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        
        that.sendXS1("get_state_"+styp+"&number="+id + "&sutime="+from_s+"&eutime="+to_s, function(err,obj) {
            if (err) return callback(err,[]);
            callback(null,obj.data);
        });
        
    };

    that.getStatistics = function(name,callback,from_s,to_s) {
        if (!name && ! callback)
            return that.emit("error","MyXS1.getHistory argumen error:("+name+","+callback+","+from_s+","+to_s);
        from_s = Math.floor((from_s || Date.now()-1000*60*60*24*365)/1000);
        to_s = Math.floor((to_s ||Date.now())/1000);
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        that.sendXS1("get_state_"+styp+"&number="+id + "&sutime="+from_s+"&eutime="+to_s+"&statistics", function(err,obj) {
            if (err)
                return callback(err,[]);
            callback(null,obj.statistics);
        });
        
    };

}

util.inherits(MyXS1, EventEmitter);
// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = utils.adapter('xs1');

//adapter.log.info('Adapter SW loading');

// var MyXS1 =     require(__dirname + '/lib/myxs1');

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        myXS1.disconnect();
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

var myXS1 = null;

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:


    adapter.log.warn('config XS1 Addresse: ' + adapter.config.adresse);
    adapter.log.info("Before New "+ objToString(MyXS1));

    myXS1 = new MyXS1();

    adapter.log.info("after New "+ objToString(myXS1));
    
    myXS1.on("error",function(msg) {
        adapter.log.info('Error message from XS1:'+ msg);
    });

    myXS1.startXS1(adapter.config.adresse, function(err,obj){
        if(err)
            adapter.log.warn("Error came back "+err);
        adapter.log.info("XS1 connected");
    });


    myXS1.on('data',function(msg){
        adapter.log.info("Data received "+objToString(msg) );
    });

    /**
     *
     *      For every state in the system there has to be also an object of type state
     *
     *      Here a simple template for a boolean variable named "testVariable"
     *
     *      Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
     *
     */

    adapter.setObject('testVariable', {
        type: 'state',
        common: {
            name: 'testVariable',
            type: 'boolean',
            role: 'indicator'
        },
        native: {}
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */

    // the variable testVariable is set to true as command (ack=false)
    adapter.setState('testVariable', true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    adapter.setState('testVariable', {val: true, ack: true});

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });



}
