var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');
var through = require('through2');

var peernet = require('../');
var transport = require('../transport.js')();
var wsock = require('../server/wsock.js');

var os = require('os');
var tmpdir = path.join(os.tmpdir(), 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

test('linear', function (t) {
    var peers = [];
    var addrs = [];
    var pending = 0;
    var n = 5;
    t.plan(n * 2 - 1 + 4);
    t.on('end', function () {
        peers.forEach(function (peer) {
            peer.connections().forEach(function (addr) {
                peer.disconnect(addr);
            });
        });
    });
    
    for (var i = 0; i < n; i++) (function () {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport,
            interval: 0,
            bootstrap: false,
            debug: true
        });
        var server = wsock(peer);
        pending ++;
        server.listen(function () {
            var addr = 'ws://localhost:' + server.address().port;
            addrs.push(addr);
            peer.save(addr, function (err) {
                t.ifError(err, 'saved node ' + addr);
                if (-- pending === 0) ready();
            });
        });
        t.on('end', function () {
            server.close();
        });
        peers.push(peer);
    })();
    
    function ready () {
        var pending = 0;
        for (var i = 1; i < peers.length; i++) {
            pending += 2;
            peers[i].once('response:_hello', function (hello) {
                if (-- pending === 0) connected();
            });
            peers[i].connect(addrs[i-1], function (err) {
                t.ifError(err);
                if (-- pending === 0) connected();
            });
        }
    }
    
    function connected () {
        setTimeout(search, 2000);
        peers[0].on('request:search', function (req) {
            t.equal(req.type.toString(), 'search');
            t.equal(req.data.toString(), 'whatever', 'request:search payload');
        });
        peers[0].on('request', function (req) {
            t.equal(req.type.toString(), 'search');
            t.equal(req.data.toString(), 'whatever', 'search payload');
            req.reply(addrs[0]);
        });
    }
    
    function search () {
        var s = peers[peers.length-1].announce({
            type: 'search',
            data: 'whatever'
        });
        var expected = [
            {
                type: 'search',
                data: 'whatever',
                hops: n - 2
            }
        ];
        s.pipe(through.obj(function (row, enc, next) {
            var ex = expected.shift();
            t.equal(row.hops, ex.hops, 'expected hops');
            t.equal(row.data.toString(), ex.data, 'expected data');
            t.equal(row.type.toString(), ex.type, 'expected type');
            next();
        }));
    }
});
