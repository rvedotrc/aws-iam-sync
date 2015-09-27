var Executor = function (max) {
    this.queue = [];
    this.running = 0;
    this.max = Math.floor(0 + max);
    this.errors = 0;

    var executor = this;
    this.runMyNextJob = function () {
        executor.runNextJob();
    };

    if (this.max <= 0 || !Number.isFinite(this.max)) {
        throw new Error("Attempt to create Executor with max < 1");
    }
};

Executor.prototype.inspect = function () {
    return {
        queue: this.queue.length,
        running: this.running,
        max: this.max,
        errors: this.errors
    };
};

Executor.prototype.toString = function () {
    return "Executor" + JSON.stringify(this.inspect());
};

Executor.prototype.submit = function (job) {
    this.queue.push(arguments);
    if (this.running < this.max) {
        ++this.running;
        process.nextTick(this.runMyNextJob);
    }
};

Executor.prototype.runNextJob = function () {
    if (this.queue.length === 0) {
        --this.running;
        return;
    }

    var functionAndArgs = this.queue.shift();

    // Got a better way?
    var args = [];
    for (var i=0; i<functionAndArgs.length; ++i) {
        args[i] = functionAndArgs[i];
    }

    // arg 0 was the job function...
    var func = args[0];

    // ... replace it by the nextJob callback
    args[0] = this.runMyNextJob;

    try {
        func.apply(null, args);
    } catch (error) {
        console.log("Job threw an error:", (error.stack ? error.stack : error));
        ++this.errors;
        process.nextTick(this.runMyNextJob);
    }
};

module.exports = Executor;
