"use strict";

var EventEmitter = require("events").EventEmitter;
var Transport = require("kimbu").Transport;
var Client = require("kimbu").Client;
var util = require("util");
var assert = require("assert");
var Promise = require("bluebird");

/**
 * Emitted when the worker is ready for sending events. The event takes no arguments.
 *
 * @event ready
 * @memberof Worker
 *
 * @public
 */

/**
 * Emitted when an error occurs during initialisation of the worker.
 * The event takes an Error object as argument.
 *
 * @event error
 * @memberof Worker
 *
 * @public
 */

/**
 * <p>The Worker class is the basic building block to implement concrete business logic.
 * It is responsible to fetch requests for this particular worker from the messaging backend
 * fabric. It further implements a request-reply and publish-subscribe message patterns (see
 * the excellent book *Enterprise Integration Patterns. Designing, Building, and Deploying Messaging Solutions*
 * by Gregor Hohpe and Bobby Woolf).</p>
 * <p>When the worker is ready initializing a `ready` event is emitted. When that event is received,
 * the worker is ready to send messages itself. See example below for an example where the worker
 * publishes a ping message every second.</p>
 * <p>When the worker is encountering an error during initialisation, an `error` event is emitted.</p>
 * <p>To create a specific worker one must create a new instance of the Worker and specify
 * the methods and events the worker supports, together with a messaging backend middleware plugin.</p>
 *
 * @example
 * var Worker = require("..");
 * var Transport = require("kimbu").Transport;
 *
 * var rabbitmq = new Transport.providers.RabbitMQTransport();
 * var worker = new Worker("myWorker", rabbitmq, {
 *   //define the messages that we support
 *   "myservice.doSomethingAmazing": doSomethingAmazing,
 *   "otherservice.somethingHappened": somethingHappened
 * });
 *
 * //parameters contains the parameters that were supplied when the message was sent
 * //`next` is a callback that must be called when the message is handled.
 * //`next' can be called with or without parameters (non-void vs. void return) or
 * //can be called with an Error object
 * function doSomethingAmazing(parameters, next) {
 *   next("Nodejs is magnificent.");
 * };
 *
 * worker.on("ready", function() {
 *   setTimeout(function() {
 *     worker.publish("myservice.ping", new Date());
 *   }, 1000);
 *   worker.request("myservice.doSomethingAmazing", [1, 2], function(err, reply) {
 *     if (err) {
 *       //some error occurred underway
 *     } else {
 *       console.log("We got a reply:", reply);
 *     }
 *   });
 * });
 *
 * @class
 * @extends {EventEmitter}
 * @public
 * @param {!String} workerName - The name of the worker. Must not be null or empty.
 * @param {!Transport} transport - The transport used to communicate with the
 * messaging backend fabric. The transport must implement the Transport interface.
 * @param {!Object} messages - The messages that this worker listens to and/or implements. It is
 * an object where the keys represent the name of the messages this worker listens to,
 * and the values indicate a callback method that should be called when the message is received.
 * In the example below, the worker listens to the `myservice.doSomethingAmazing` request and the
 * `otherservice.somethingHappened` event.
 * @emits Worker.event:error
 * @emits Worker.event:ready
*/
function Worker(workerName, transport, messages) {
  assert.ok(util.isString(workerName), "workerName must be a valid string");
  assert(workerName.length > 0, "workerName must be a valid string");
  assert.ok(transport instanceof Transport);
  assert.ok(util.isObject(messages));

  var self = this;

  var deferred = Promise.pending();

  this._client = new Client(workerName, transport, function(err) {
    /* istanbul ignore if */
    if (err) {
      deferred.reject(err);
    } else {
      self._messages = messages;
      self._registerMessages(messages);
      deferred.resolve();
    }
  });

  this._connectionPromise = deferred.promise;

  //TODO: catch messagebus disconnected event
}
util.inherits(Worker, EventEmitter);

/**
 * Registers the given messages with the client.
 *
 * @param {!Object} messages - An object where the keys represent the name of the messages this worker listens to,
 * and the values indicate a callback method that should be called when the message is received.
 *
 * @private
 */
Worker.prototype._registerMessages = function(messages) {
  for (var m in messages) {
    /* istanbul ignore else */
    if (messages.hasOwnProperty(m)) {
      this._client.on(m, messages[m].bind(this));
    }
  }
};

/**
 * Unregisters the given messages from the client.
 *
 * @param {!Object} messages - An object where the keys represent the name of the messages this worker listens to,
 * and the values indicate a callback method that should be called when the message is received.
 *
 * @private
 */
Worker.prototype._unregisterMessages = function(messages) {
  for (var m in messages) {
    /* istanbul ignore else */
    if (messages.hasOwnProperty(m)) {
      this._client.off(m);
    }
  }
};

/**
 * Sends out the given `cmd` with the supplied `parameters` and `options` to backend message bus.
 * When an error occurs or a reply is received, the given `callback` is called. This is an
 * RPC-style method call.
 *
 * @param {!String} cmd - the command to execute
 * @param {!Object|String|Array|Number|Date} parameters - the parameters that go with the command
 * @param {!Object} options - Options that refer to priority, TTL, and so. TBD
 * @param {!RequestCallback} callback - called when the command has been executed or when an error occurred.
 *
 * @public
 */
Worker.prototype.request = function(cmd, parameters, options, callback) {
  this._client.request(cmd, parameters, options, callback);
};

/**
 * Sends out the given `event` with the supplied `parameters` and `options` to backend message bus.
 * When an error occurs, the given optional `callback` is called. This is a publish-subscribe style
 * method call.
 *
 * @param {!String} event - the event to publish
 * @param {!Object|String|Array|Number|Date} parameters - the parameters that go with the event
 * @param {!Object} options - Options that refer to priority, TTL, and so. TBD
 * @param {PublishCallback=} callback - called when the event has been published.
 *
 * @public
 */
Worker.prototype.publish = function(event, parameters, options, callback) {
  this._client.publish(event, parameters, options, callback);
};

/**
 * Starts the worker. Once started the worker will receive messages and will be able to
 * send messages itself.
 * Emits `ready` when started successfully or `error` when an error occurred.
 *
 * @param {Function} [callback] - Optional callback called when stop() has finished.
 *
 * @emits ready
 * @emits error
 * @public
 */
Worker.prototype.start = function(callback) {
  assert(util.isNullOrUndefined(callback) | util.isFunction(callback));
  var self = this;

  this._connectionPromise.then(function() {
    self._client.start(function(err) {
      /* istanbul ignore if */
      if (err) {
        self.emit("error", err);
      } else {
        self.emit("ready");
      }
      if (callback) {
        setImmediate(callback.bind(self, err));
      }
    });
  }, /* istanbul ignore next */
    function(err) {
    self.emit("error");
  });
};

/**
 * Stops the worker. Once stopped the worker will not receive messages nor will be able to
 * send messages itself.
 *
 * @param {Function} [callback] - Optional callback called when stop() has finished.
 *
 * @public
 */
Worker.prototype.stop = function(callback) {
  this._unregisterMessages(this._messages);
  this._client.stop(callback);
};

module.exports = Worker;
