"use strict";

var Worker = require("..").Worker;
var Transport = require("kimbu").Transport;
var logger = require("karl");

logger.setOptions({
  colorize: true,
  redirectConsole: true,
  json: false
});

var RabbitMQTransport = Transport.providers.RabbitMQTransport;

function calculatorAdd(parameters, next) {
  console.log("Received calculator.add with parameters", parameters);
  var result = parameters.reduce(function(previousValue, currentValue, index, array) {
    return previousValue + currentValue;
  });

  next(result);
}

function calculatorMultiply(parameters, next) {
  console.log("Received calculator.multiply with parameters", parameters);
  var result = parameters.reduce(function(previousValue, currentValue, index, array) {
    return previousValue * currentValue;
  });

  next(result);
}

function somethingHappened(parameters, next) {
  console.log("Received something happened", parameters);
  next();
}

var worker = new Worker("myWorker", new RabbitMQTransport(), {
  "calculator.add": calculatorAdd,
  "calculator.multiply": calculatorMultiply,
  "something.happened": somethingHappened
});

var min = 100000;
var max = 0;
var total = 0;

function calc(count) {
  var tm = process.hrtime();
  worker.request("calculator.multiply", [1, 2, 3, 4, 5, 6], {}, function(err, reply) {
    if (err) {
      console.error(err);
    }
    var diff = process.hrtime(tm);
    var diffms = (diff[0] * 1e9 + diff[1]) / 1000 / 1000;
    total += diffms;
    if (diffms < min) {
      min = diffms;
    }
    if (diffms > max) {
      max = diffms;
    }
    if (++count < 1000) {
      setTimeout(calc.bind(null, count), 0);
    } else {
      console.warn("Timings: min: %d ms, max: %d ms, avg: %d ms", min, max, total/count);
      setTimeout(process.exit.bind(null, 0), 0);
    }
  });
}

worker.on("ready", function() {
  calc(0);
});

worker.on("error", function(err) {
  console.error("Worker encountered error:", err);
});

worker.start();
