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

var worker = new Worker("myWorker", new RabbitMQTransport(), {
  "calculator.multiply": calculatorMultiply,
  "something.happened": somethingHappened
});

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

worker.on("ready", function() {
  worker.request("calculator.multiply", [1, 2, 3, 4, 5, 6], {}, function(err, reply) {
    if (err) {
      console.error("Error sending request:", err);
    } else {
      console.log("The multiplication of 1, 2, 3, 4, 5 and 6 is:", reply);
    }
    setTimeout(process.exit.bind(null, 0), 0);
  });
  worker.publish("something.happened", "Seriously?", {});
});

worker.on("error", function(err) {
  console.error("Worker encountered error:", err);
});
