### krew
  [![License][license-image]][license-url]
  [![NPM Package][npm-image]][npm-url]
  [![NPM Downloads][npm-downloads-image]][npm-downloads-url]
  [![Build Status][travis-image]][travis-url]
  [![Test Coverage][coveralls-image]][coveralls-url]
  [![Code Climate][codeclimate-image]][codeclimate-url]
  [![Dependency Status][david-image]][david-url]
  [![devDependency Status][david-dev-image]][david-dev-url]

##### Author: [Kurt Pattyn](https://github.com/kurtpattyn).

Krew is a minimalistic and flexible framework to implement microservice-like workers.
It frees the programmer from implementing messaging protocols and communication infrastructure and
lets the developer concentrate on the business logic.

## Motivation
Implementing a microservice worker requires setting up messaging middleware (in case a message queue is used)
and defining a common protocol to exchange messages.   
Although not difficult, this requires a lot of boilerplate code.  
Krew helps with this by taking away all this boilerplate from the developer by leveraging the
excellent [Kimbu][kimbu-url] module.

## Installation

```bashp
$ npm install krew
```

or

```bashp
$ npm install krew --production
```
for a production only installation (no tests, documentation, ...).

## Supported Node Versions
`Krew` supports `Node` versions 0.12 and later.  
 To use `Krew` with `Node` versions < 4.0, you must start `node` with the `--harmony` flag.

## Usage
``` javascript
  var Worker = require("krew").Worker;
  var Transport = require("kimbu").Transport;
  var RabbitMQTransport = Transport.providers.RabbitMQTransport;
  var rmq = new RabbitMQTransport();  //use default options

  function calculatorMultiply(parameters, next) {
    console.log("Received calculator.multiply with parameters", parameters);
    var result = parameters.reduce(function(previousValue, currentValue, index, array) {
      return previousValue * currentValue;
    });

    next(result);
  }

  function somethingHappened(parameters, next) {
    console.log("Received something.happened event with content:", parameters);
    next();
  }

  var worker = new Worker("myWorker", rmq, {
    "calculator.multiply": calculatorMultiply,
    "something.happened": somethingHappened
  });
  
  worker.start();
```

In this example, we first create a transport to use for the worker to send and receive messages (see also [Kimbu][kimbu-url]).  
Then a worker is created with a name (`myWorker`), a transport (`rmq`) and an options hash declaring
the messages this worker processes (`calculator.multiply` will be processed by `calculatorMultiply()`, 
`something.happened` will be processed by `somethingHappened()`).  
The callback methods receive the parameters that were sent together with a `next()` callback (
comparable with the next() method of the express middleware handlers; see http://expressjs.com/es/guide/using-middleware.html).  
The `next()` callback must be called when the message has been processed.  
In the case of a command, `next` should be called with the result (or with an error) as in
the `calculatorMultiply` method above.  
In case of an event, `next` should be called without any parameters.  
Finally, the worker is started (`worker.start()`).

To quickly test if the above example works, the worker can send messages to itself like:
``` javascript
  ...
  worker.start(function(err) {
    if (!err) {
      worker.request("calculator.multiply", [1, 2, 3], function(err, reply) {
        console.log("The result is:", reply);
      });
      worker.publish("something.happened", "The sun went down.");
    }
  });
```

## Examples
Examples can be found under the `examples` subdirectory.

## Quick Start
To quickly generate a worker, you can use the [Krew Yeoman Generator][generator-krew-url].  
This generator sets up a new worker, generating all the boilerplate you need to get started.

## API
### new Worker(workerName, transport, messageHash)
Creates a new worker with the given *workerName*.  
The worker will use the given *transport* for commmunication and will process the messages
given in *messageHash*.

**Parameters**

  * `workerName` (`String`, required): name of the worker; this name must be unique within the messaging framework
  * `transport` (`Transport`, required): the transport to use for exchanging messages
  * `messageHash` (`Object`, required): a hash containing message to callback mappings  
    *Format:* { "messageName": messageHandler }, where `messageHandler` will be called with two
    arguments: `parameters` and `next`. `next` must be called when the message has been processed.  
    In the case of a command (request-reply style of messaging) `next` must be called with the result
    of the command or with an `Error` object to indicate a failure.  
    In the case of an event (publish-subscribe style of messaging) `next` should be called without arguments.  
    See **example** below for an example of both uses.
  
**Example**
```js
  var myWorker = new Worker("myWorker", rmq, {
    "someCommand": processSomeCommand,
    "someEvent": processSomeEvent
  });
  
  function processSomeCommand(parameters, next) {
    console.log("Received some command with parameters", parameters);
    var result = "some result";
    next(result);  //call next() with the result when finished processing!
    
    //or: next(new Error("Can only multiply integers, not strings!");
  };
  
  function processSomeEvent(parameters, next) {
    console.log("Received some event with parameters", parameters);
    next();  //call next() when finished processing!
  };
```

### worker.start(callback)
Starts the worker. When started the worker will begin processing incoming commands and events.  
When the worker is successfully started a `ready` event is emitted (see `event("ready")`) and
you can start issuing requests and publishing events yourself (see **example**).
When the worker failed to start, an `error` event is emitted (see `event("error")`).
If a `callback` is supplied, it is called when the worker either started successfully or failed
to start.  
  
**Parameters**

  * `callback` (`Function`, optional): called when the worker started successfully or failed.
    It takes an 'Error' argument (nodejs style).
    
**Example**
```js
  var myWorker = new Worker(...);
  
  myWorker.start(function(err) {
    if (err) {
      console.error("Oops, something went wrong", err);
      process.exit(-1);
    } else {
      //now we can make requests ourselves
      //yes, parameters can be objects as well
      myWorker.request("say.something.funny", { name: "krew", version: { major: 1, minor: 0 } }, function(err, reply) {
        if (err) {
          console.error("Oops, someone had a problem saying something funny", err);
        } else {
          console.log("Someone said something funny:", reply);
        }
      });
      myWorker.publish("important.notification", "I am alive and kicking");
    }
  });
```

### worker.stop(callback)
Stops the worker. When stopped the worker will stop processing incoming commands and events.  
If a `callback` is supplied, it is called when the worker either stopped successfully or failed
to stop.  

### worker.request(commandName, parameters, options, callback)
Executes the command with the given `commandName` and `parameters` and calls the `callback` when
an error is encountered or an answer is received. This is actually an RPC-like call.  

**Parameters**

  * `commandName` (`String`, required): name of the command to execute
  * `parameters` (`any`, required): a single argument that can be any Javascript entity that is JSON stringifyable (JSON.stringify).
    Multiple parameters to the command should either be passed as an `Array` or as an `Object`.
  * `options` (`Object`, required): Currently not used; set to an empty object, e.g. `{}`.
  * `callback` (`Object`, required): called when the request returns.
    It takes two arguments: `err` and `reply`. `err` is not null if an error occurred, else
    `reply` contains the result of the request.
  
**Example**
```js
  //using an Object as parameters
  myWorker.request("say.something.funny", { name: "krew", version: { major: 1, minor: 0 } }, function(err, reply) {
    if (err) {
      console.error("Oops, someone had a problem saying something funny", err);
    } else {
      console.log("Someone said something funny:", reply);
    }
  });

  //using an Array as parameters
  myWorker.request("calculator.add", [1, 2, 3, 4], function(err, reply) {
    if (err) {
      console.error("Oops, the calculator went bezerk", err);
    } else {
      console.log("The sum is:", reply);
    }
  });

  //using an String as parameters
  myWorker.request("utils.uppercase", "lowercase", function(err, reply) {
    if (err) {
      console.error("Oops, utils.uppercase seems sick", err);
    } else {
      console.log("uppercased:", reply);
    }
  });
```
  
**Parameters**

  * `callback` (`Function`, optional): called when the worker stopped successfully or failed.
    It takes an 'Error' argument (nodejs style).

## Tests

#### Unit Tests

```bashp
$ npm test
```

#### Unit Tests with Code Coverage

```bashp
$ npm run test-cov
```

This will generate a folder `coverage` containing coverage information and a folder `coverage/lcov-report` containing an HTML report with the coverage results.

```bashp
$ npm run test-ci
```
will create a folder `coverage` containing `lcov` formatted coverage information to be consumed by a 3rd party coverage analysis tool. This script is typically used on a continuous integration server.

#### Benchmarks

```bashp
$ npm run benchmark
```

#### Checkstyle

Executing

```bashp
$ npm run check-style
```

will run the `jscs` stylechecker against the code.

#### Static Code Analysis

Executing

```bashp
$ npm run code-analysis
```

will run `jshint` to analyse the code.

#### Code Documentation

Executing

```bashp
$ npm run make-docs
```

will run `jsdoc` to create documentation.

## License

  [MIT](LICENSE)

[npm-image]: https://badge.fury.io/js/krew.svg
[npm-url]: https://www.npmjs.com/package/krew
[npm-downloads-image]: https://img.shields.io/npm/dm/krew.svg?style=flat
[npm-downloads-url]: https://www.npmjs.org/package/krew
[coveralls-image]: https://coveralls.io/repos/KurtPattyn/krew/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/KurtPattyn/krew?branch=master
[travis-image]: https://travis-ci.org/KurtPattyn/krew.svg?branch=master
[travis-url]: https://travis-ci.org/KurtPattyn/krew
[codeclimate-image]: https://codeclimate.com/github/KurtPattyn/krew/badges/gpa.svg
[codeclimate-url]: https://codeclimate.com/github/KurtPattyn/krew
[david-image]: https://david-dm.org/kurtpattyn/krew.svg
[david-url]: https://david-dm.org/kurtpattyn/krew
[david-dev-image]: https://david-dm.org/kurtpattyn/krew/dev-status.svg
[david-dev-url]: https://david-dm.org/kurtpattyn/krew#info=devDependencies
[kimbu-url]: https://www.npmjs.com/package/krew
[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE
[generator-krew-url]: https://www.npmjs.com/package/generator-krew
[yeoman-logo-url]: http://yeoman.io/static/mustache.d62b915ab6.svg
