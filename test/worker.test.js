"use strict";

var Transport = require("kimbu").Transport;
var Worker = require("..").Worker;
var util = require("util");
var assert = require("assert");

describe("Worker", function() {
  describe("constructor", function() {
    var rmq = new (Transport.providers.RabbitMQTransport)();
    it("should throw an assertion failure with a non-String worker name", function (done) {
      assert.throws(function () {
          new Worker({a: 3}, rmq, {});
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });

    it("should throw an assertion failure with an empty worker name", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      assert.throws(function () {
          new Worker("", rmq, {});
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });

    it("should throw an assertion failure with a null worker name", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      assert.throws(function () {
          new Worker(null, rmq, {});
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });

    it("should throw an assertion failure with a non-Transport transport", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      assert.throws(function () {
          new Worker("someworker", [1, 2, 3, 4], {});
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });

    it("should throw an assertion failure with a null transport", function (done) {
      assert.throws(function () {
          new Worker("someworker", null, {});
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });

    it("should throw an assertion failure with a non-Object options hash", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      assert.throws(function () {
          new Worker("someworker", rmq, "not an object");
        }, /AssertionError/,
        "Should throw an AssertionError");
      rmq.disconnect();
      done();
    });
  });

  describe(".start", function() {
    it("should not throw an error when no callback is provided", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": function(parameters, next) { next(); }
      });

      w1.on("ready", function() {
        w1.stop();
        done();
      });
      assert.doesNotThrow(function() {
        w1.start();
      }, "Should not throw any exception");
    });

    it("should throw an error when an invalid callback is provided", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": function(parameters, next) { next(); }
      });

      assert.throws(function() {
        w1.start("invalid callback");
      }, /AssertionError/,
      "Should throw an AssertionError");

      done();
    });

    it("should call the callback when started or on error", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": function(parameters, next) { next(); }
      });

      w1.start(function(/* err */) {
        w1.stop();
        done();
      });
    });

    it("should emit ready or error", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w = new Worker("someworker", rmq, {});

      w.on("ready", function () {
        w.stop();
        rmq.disconnect();
        done();
      });
      w.on("error", function () {
        rmq.disconnect();
        done();
      });
      w.start();
    });

    it("should deliver the registered message names to the given methods", function (done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();

      var w = new Worker("someworker", rmq, {
        "msg": onMessage
      });

      function onMessage(parameters, next) {
        next();
        w.stop();
        done();
      }

      w.on("ready", function () {
        w.publish("msg", "msg body", {}, function (err) {
          assert(util.isNullOrUndefined(err));
        });
      });
      w.start();
    });
  });

  describe(".publish", function() {
    it("should publish the event to the registered method", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": onMsg
      });

      function onMsg(parameters, next) {
        next();
        w1.stop();
        done();
      }

      w1.on("ready", function() {
        w1.publish("msg", "msg body", {}, function(err) {
          assert(util.isNullOrUndefined(err));
        });
      });
      w1.on("error", function(err) {
        console.error("Error occurred", err);
      });

      w1.start();
    });

    it("should publish the event to all registered methods", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": onMsg
      });
      var w2 = new Worker("anotherworker", rmq, {
        "msg": onMsg
      });

      var numMessagesReceived = 0;

      function onMsg(parameters, next) {
        next();
        if (++numMessagesReceived == 2) {
          w1.stop();
          w2.stop();
          done();
        }
      }

      w1.on("ready", function() {
        w1.publish("msg", "msg body", {}, function(err) {
          assert(util.isNullOrUndefined(err));
        });
      });

      w2.start();
      w1.start();
    });
  });

  describe(".request", function() {
    it("should publish the command to the registered method and receive a correct reply", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": onMsg
      });

      function onMsg(parameters, next) {
        next(parameters + "!");
        w1.stop();
        done();
      }

      w1.on("ready", function() {
        w1.request("msg", "msg body", {}, function(err, reply) {
          assert(util.isNullOrUndefined(err));
          assert.equal(reply, "msg body!");
        });
      });
      w1.on("error", function(err) {
        console.error("Error occurred", err);
      });

      w1.start();
    });

    it("should publish the command to all of the different workers", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": onMsg
      });
      var w2 = new Worker("anotherworker", rmq, {
        "msg": onMsg
      });

      var numMessagesReceived = 0;

      function onMsg(parameters, next) {
        next(parameters + "!");
        ++numMessagesReceived;
      }

      w1.on("ready", function() {
        w1.request("msg", "msg body", {}, function(err, reply) {
          assert(util.isNullOrUndefined(err));
          assert.equal(reply, "msg body!");

          setTimeout(function() {
            assert.equal(numMessagesReceived, 2);
            w1.stop();
            w2.stop();
            done();
          }, 0);
        });
      });
      w2.start(function(err) {
        assert(util.isNullOrUndefined(err));
        w1.start();
      });
    });

    it("should publish the command in a round robin way to a cluster of the same workers", function(done) {
      var rmq = new (Transport.providers.RabbitMQTransport)();
      var w1 = new Worker("someworker", rmq, {
        "msg": onMsg
      });
      var w2 = new Worker("someworker", rmq, {
        "msg": onMsg2
      });

      var numMessagesReceivedByWorker1 = 0;
      var numMessagesReceivedByWorker2 = 0;

      function onMsg(parameters, next) {
        next(parameters + "!");
        ++numMessagesReceivedByWorker1;
      }

      function onMsg2(parameters, next) {
        next(parameters + "!");
        ++numMessagesReceivedByWorker2;
      }

      w1.on("ready", function () {
        w1.request("msg", "msg body", {}, function (err, reply) {
          assert(util.isNullOrUndefined(err));
          assert.equal(reply, "msg body!");

          console.log("Sending second message");

          w1.request("msg", "another msg body", {}, function (err, reply) {
            assert(util.isNullOrUndefined(err));
            assert.equal(reply, "another msg body!");

            setTimeout(function () {
              assert.equal(numMessagesReceivedByWorker1, 1, "Worker1 should receive exactly 1 message");
              assert.equal(numMessagesReceivedByWorker2, 1, "Worker2 should receive exactly 1 message");
              w1.stop();
              w2.stop();
              done();
            }, 0);
          });
        });
      });
      w2.start(function(err) {
        assert(util.isNullOrUndefined(err));
        w1.start();
      });
    });
  });
});
