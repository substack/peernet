var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');
var through = require('through2');
var shuf = require('shuffle-array');
var wrtc = require('wrtc');

var peernet = require('../');
var transport = require('../transport.js')();
var wsock = require('../server/wsock.js');

var os = require('os');
var tmpdir = path.join(os.tmpdir(), 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

var addrs = [];
var peers = [];
var servers = [];

test('bootstrap setup', function (t) {
    t.plan(5*2 + 25);
    var pending = 0;
    
    // 5 websocket servers
    for (var i = 0; i < 5; i++) (function () {
        pending ++;
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport,
            //interval: 500,
            connections: 10
            //debug: true
        });
        peers.push(peer);
        
        var server = wsock(peer);
        server.listen(function () {
            var addr = 'ws://localhost:' + server.address().port;
            addrs.push(addr);
            peer.save(addr, function (err) {
                t.ifError(err, 'saved node ' + addr);
                if (-- pending === 0) ready();
            });
        });
        servers.push(server);
    })();
    
    // 25 peers without servers, like browsers
    for (var i = 0; i < 25; i++) (function () {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport,
            wrtc: wrtc,
            connections: 10
        });
        peers.push(peer);
    })();
    
    function ready () {
        pending = peers.length;
        peers.forEach(function (peer) {
            var nodes = shuf(addrs.slice()).slice(0,Math.random()*2+3)
            peer.save(nodes, function (err) {
                t.ifError(err);
            });
        });
    }
});

test('bootstrap', function (t) {
    t.plan(2);
    console.log('waiting for connections');
    setTimeout(function () {
        var stats = { ws: 0, wrtc: 0 };
        for (var i = 5; i < 30; i++) {
            var cons = peers[i].connections();
            cons.forEach(function (c) {
                if (/^ws:/.test(c)) {
                    stats.ws ++;
                }
                else if (/^wrtc:/.test(c)) {
                    stats.wrtc ++;
                }
            });
        }
        console.log('STATS:', stats);
        t.ok(stats.ws >= 50, 'enough websocket connections');
        t.ok(stats.wrtc >= 50, 'enough webrtc connections');
    }, 1000*60*3);
});

test('bootstrap teardown', function (t) {
    servers.forEach(function (server) { server.close() });
    peers.forEach(function (peer) { peer.close() });
    t.end();
});
