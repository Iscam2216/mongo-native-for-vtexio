/* eslint no-empty: ["error", { "allowEmptyCatch": true }] */
'use strict';

const expect = require('chai').expect;
const mock = require('../tools/mongodb-mock/index');
const { getSymbolFrom } = require('../tools/utils');
const { ReplSetFixture } = require('../tools/common');
const { ns, isHello } = require('../../src/utils');
const { Topology } = require('../../src/sdam/topology');
const { MongoNetworkError, MongoWriteConcernError } = require('../../src/index');
const {
  LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE,
  LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE,
  NODE_IS_RECOVERING_ERROR_MESSAGE
} = require('../../src/error');
const {
  isRetryableEndTransactionError,
  MongoParseError,
  isSDAMUnrecoverableError,
  MongoError
} = require('../../src/error');
const {
  PoolClosedError: MongoPoolClosedError,
  WaitQueueTimeoutError: MongoWaitQueueTimeoutError
} = require('../../src/cmap/errors');

describe('MongoErrors', () => {
  // import errors as object
  let errorClasses = Object.fromEntries(
    Object.entries(require('../../src/index')).filter(([key]) => key.endsWith('Error'))
  );
  errorClasses = { ...errorClasses, MongoPoolClosedError, MongoWaitQueueTimeoutError };

  for (const errorName in errorClasses) {
    describe(errorName, () => {
      it(`name should be read-only`, () => {
        // Dynamically create error class with message
        let error = new errorClasses[errorName]('generated by test');
        // expect name property to be class name
        expect(error).to.have.property('name', errorName);

        try {
          error.name = 'renamed by test';
        } catch (err) {}
        expect(error).to.have.property('name', errorName);
      });
    });
  }

  describe('#isRetryableEndTransactionError', function () {
    context('when the error has a RetryableWriteError label', function () {
      const error = new MongoNetworkError('');
      error.addErrorLabel('RetryableWriteError');

      it('returns true', function () {
        expect(isRetryableEndTransactionError(error)).to.be.true;
      });
    });

    context('when the error does not have a RetryableWriteError label', function () {
      const error = new MongoNetworkError('');
      error.addErrorLabel('InvalidLabel');

      it('returns false', function () {
        expect(isRetryableEndTransactionError(error)).to.be.false;
      });
    });

    context('when the error does not have any label', function () {
      const error = new MongoNetworkError('');

      it('returns false', function () {
        expect(isRetryableEndTransactionError(error)).to.be.false;
      });
    });
  });

  describe('#isSDAMUnrecoverableError', function () {
    context('when the error is a MongoParseError', function () {
      it('returns true', function () {
        const error = new MongoParseError('');
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context('when the error is null', function () {
      it('returns true', function () {
        expect(isSDAMUnrecoverableError(null)).to.be.true;
      });
    });

    context('when the error has a "node is recovering" error code', function () {
      it('returns true', function () {
        const error = new MongoError('');
        // Code for NotPrimaryOrSecondary
        error.code = 13436;
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context('when the error has a "not writable primary" error code', function () {
      it('returns true', function () {
        const error = new MongoError('');
        // Code for NotWritablePrimary
        error.code = 10107;
        expect(isSDAMUnrecoverableError(error)).to.be.true;
      });
    });

    context(
      'when the code is not a "node is recovering" error and not a "not writable primary" error',
      function () {
        it('returns false', function () {
          // If the response includes an error code, it MUST be solely used to determine if error is a "node is recovering" or "not writable primary" error.
          const error = new MongoError(NODE_IS_RECOVERING_ERROR_MESSAGE);
          error.code = 555;
          expect(isSDAMUnrecoverableError(error)).to.be.false;
        });
      }
    );

    context(
      'when the error message contains the legacy "not primary" message and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(`this is ${LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE}.`);
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );

    context(
      'when the error message contains "node is recovering" and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(`the ${NODE_IS_RECOVERING_ERROR_MESSAGE} from an error`);
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );

    context(
      'when the error message contains the legacy "not primary or secondary" message and no error code is used',
      function () {
        it('returns true', function () {
          const error = new MongoError(
            `this is ${LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE}, so we have a problem `
          );
          expect(isSDAMUnrecoverableError(error)).to.be.true;
        });
      }
    );
  });

  describe('when MongoNetworkError is constructed', () => {
    it('should only define beforeHandshake symbol if boolean option passed in', function () {
      const errorWithOptionTrue = new MongoNetworkError('', { beforeHandshake: true });
      expect(getSymbolFrom(errorWithOptionTrue, 'beforeHandshake', false)).to.be.a('symbol');

      const errorWithOptionFalse = new MongoNetworkError('', { beforeHandshake: false });
      expect(getSymbolFrom(errorWithOptionFalse, 'beforeHandshake', false)).to.be.a('symbol');

      const errorWithBadOption = new MongoNetworkError('', { beforeHandshake: 'not boolean' });
      expect(getSymbolFrom(errorWithBadOption, 'beforeHandshake', false)).to.be.an('undefined');

      const errorWithoutOption = new MongoNetworkError('');
      expect(getSymbolFrom(errorWithoutOption, 'beforeHandshake', false)).to.be.an('undefined');
    });
  });

  describe('WriteConcernError', function () {
    let test;
    const RAW_USER_WRITE_CONCERN_CMD = {
      createUser: 'foo2',
      pwd: 'pwd',
      roles: ['read'],
      writeConcern: { w: 'majority', wtimeoutMS: 1 }
    };

    const RAW_USER_WRITE_CONCERN_ERROR = {
      ok: 0,
      errmsg: 'waiting for replication timed out',
      code: 64,
      codeName: 'WriteConcernFailed',
      writeConcernError: {
        code: 64,
        codeName: 'WriteConcernFailed',
        errmsg: 'waiting for replication timed out',
        errInfo: {
          wtimeout: true
        }
      }
    };

    const RAW_USER_WRITE_CONCERN_ERROR_INFO = {
      ok: 0,
      errmsg: 'waiting for replication timed out',
      code: 64,
      codeName: 'WriteConcernFailed',
      writeConcernError: {
        code: 64,
        codeName: 'WriteConcernFailed',
        errmsg: 'waiting for replication timed out',
        errInfo: {
          writeConcern: {
            w: 2,
            wtimeout: 0,
            provenance: 'clientSupplied'
          }
        }
      }
    };

    before(() => (test = new ReplSetFixture()));
    afterEach(() => mock.cleanup());
    beforeEach(() => test.setup());

    function makeAndConnectReplSet(cb) {
      let invoked = false;
      const replSet = new Topology(
        [test.primaryServer.hostAddress(), test.firstSecondaryServer.hostAddress()],
        { replicaSet: 'rs' }
      );

      replSet.once('error', err => {
        if (invoked) {
          return;
        }
        invoked = true;
        cb(err);
      });

      replSet.on('connect', () => {
        if (invoked) {
          return;
        }

        invoked = true;
        cb(undefined, replSet);
      });

      replSet.connect();
    }

    it('should expose a user command writeConcern error like a normal WriteConcernError', function (done) {
      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(test.primaryStates[0]));
        } else if (doc.createUser) {
          setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR));
        }
      });

      makeAndConnectReplSet((err, topology) => {
        // cleanup the server before calling done
        const cleanup = err => topology.close({ force: true }, err2 => done(err || err2));

        if (err) {
          return cleanup(err);
        }

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          server.command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
            let _err;
            try {
              expect(err).to.be.an.instanceOf(MongoWriteConcernError);
              expect(err.result).to.exist;
              expect(err.result).to.have.property('ok', 1);
              expect(err.result).to.not.have.property('errmsg');
              expect(err.result).to.not.have.property('code');
              expect(err.result).to.not.have.property('codeName');
              expect(err.result).to.have.property('writeConcernError');
            } catch (e) {
              _err = e;
            } finally {
              cleanup(_err);
            }
          });
        });
      });
    });

    it('should propagate writeConcernError.errInfo ', function (done) {
      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(test.primaryStates[0]));
        } else if (doc.createUser) {
          setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR_INFO));
        }
      });

      makeAndConnectReplSet((err, topology) => {
        // cleanup the server before calling done
        const cleanup = err => topology.close(err2 => done(err || err2));

        if (err) {
          return cleanup(err);
        }

        topology.selectServer('primary', (err, server) => {
          expect(err).to.not.exist;

          server.command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
            let _err;
            try {
              expect(err).to.be.an.instanceOf(MongoWriteConcernError);
              expect(err.result).to.exist;
              expect(err.result.writeConcernError).to.deep.equal(
                RAW_USER_WRITE_CONCERN_ERROR_INFO.writeConcernError
              );
            } catch (e) {
              _err = e;
            } finally {
              cleanup(_err);
            }
          });
        });
      });
    });
  });
});
