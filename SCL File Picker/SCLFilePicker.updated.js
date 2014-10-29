/* Secure Content Locker File Picker
   Author: Jason Moon, jmoon@vmware.com, https://vmware-com.socialcast.com/users/573962
   Status codes:
      1, file selected, A file has been selected in the popup window
     -1, not supported, Your browser does not support this feature (IE7)
     -2, not initialized, init() must be called before open()
     -3, missing domain, The required "domain" property was missing from the initialization options
     -4, popup blocked, Your browser has blocked the popup window
     -5, popup closed, The popup was closed by the user before selecting a file
     -6, popup reopened, A previous popup was forcibly closed, and a new one reopened
 */
(function() {
  'use strict';

  // AirWatch configurable items
  var iframeProxyPath = '/path/to/iframe.htm';
  var popupProperties = {
    height: 520,
    width: 590,
    path: '/path/to/popup',
    scheme: 'http://' // This will be https in production!
  };

  // Default AirWatch settings; can be overridden by user
  var defaultOptions = {
    linkType: 'preview',
    multiple: false
  };

  // Remaining non-configurable variables below
  var hasEventListener = !!window.addEventListener;
  var eventMethodName = (hasEventListener) ? 'addEventListener' : 'attachEvent';
  var removeMethodName = (hasEventListener) ? 'removeEventListener' : 'detachEvent';
  var messageEventName = (hasEventListener) ? 'message' : 'onmessage';
  var isOldIE = /MSIE/.test(navigator.userAgent);
  var iframeName = 'SCLFilePicker_iframe';
  var popup = {
    name: 'SCLFilePicker_popup'
  };

  function isFunc(f) {
    return typeof f === 'function';
  }

  function closePopupWith(message) {
    if (popup.win && !popup.win.closed) {
      clearTimeout(popup.timer);
      popup.deferred.reject(message);
      popup.win.close();
      return true;
    }
    return false;
  }

  // Constructor
  function Deferred() {
    this.state = 'pending';
    this.args = [];
    this.callbacks = {
      done: [],
      fail: [],
      always: []
    };
  };

  Deferred.prototype.runCallbacks = function(callbackListName) {
    var callbackList = this.callbacks[callbackListName];
    var count = callbackList.length;
    var callbacks = callbackList.splice(0, count); // clear out the queue
    for (var i=0;i<count;i++) {
      callbacks[i].apply(window, this.args);
    }
    // Run "always" after "done" & "fail" have completed
    if (callbackListName !== 'always') {
      this.runCallbacks('always');
    }
  };


  Deferred.prototype.addCallback = function(options) {
    var argCount = options.args.length;
    var callbackList = this.callbacks[options.listName];
    for (var j=0;j<argCount;j++) {
      if (isFunc(options.args[j])) {
        callbackList.push(options.args[j]);
      }
    }
    if (options.immediate) {
      this.runCallbacks(options.listName);
    }
  };

  Deferred.prototype.resolve = function() {
    if (this.state === 'pending') {
      this.state = 'resolved';
      this.args = arguments;
      this.runCallbacks('done');
    }
  };

  Deferred.prototype.reject = function() {
    if (this.state === 'pending') {
      this.state = 'rejected';
      this.args = arguments;
      this.runCallbacks('fail');
    }
  };

  // Public Promise API
  Deferred.prototype.promise = function() {
    var deferred = this;
    return {
      state: function() {
        return deferred.state;
      },
      done: function() {
        if (deferred.state === 'rejected') {
          return this;
        }
        deferred.addCallback({
          args: arguments,
          listName: 'done',
          immediate: deferred.state === 'resolved'
        });
        return this;
      },
      fail: function() {
        if (deferred.state === 'resolved' || !arguments.length) {
          return this;
        }
        deferred.addCallback({
          args: arguments,
          listName: 'fail',
          immediate: deferred.state === 'rejected'
        });
        return this;
      },
      then: function(success, error) {
        return this.done(success).fail(error);
      },
      always: function() {
        deferred.addCallback({
          args: arguments,
          listName: 'always',
          immediate: deferred.state !== 'pending'
        });
        return this;
      }
    };
  };

  window.SCLFilePicker = (function() {
    var iframeProxy;
    var settings = {};
    var initialized = false;

    function launchPopup(options) {
      var promise, paramValue;
      var watchInterval = 100;
      var popupUrl = popup.origin + popupProperties.path + '?origin=' + encodeURIComponent(location.protocol + '//' + location.hostname);
      var popupFeatures = 'height=' + popupProperties.height + ',width=' + popupProperties.width;

      // Pass the options to the popup, based on the defaults
      options = options || {};
      for (var prop in defaultOptions) {
        paramValue = (typeof options[prop] !== 'undefined') ? options[prop] : defaultOptions[prop];
        popupUrl += '&' + prop + '=' + encodeURIComponent(paramValue);
      }

      // Always clear previous timer before opening the next popup
      clearTimeout(popup.timer);

      popup.deferred = new Deferred();
      promise = popup.deferred.promise();
      popup.win = window.open(popupUrl, popup.name, popupFeatures);

      // Quit now and reject promise if popup was blocked
      if (popup.win === null) {
        popup.deferred.reject({
          status: -4,
          statusText: 'popup blocked'
        });
        return promise;
      }

      // Monitor the popup so we know if it has been closed by the user, before a file was selected
      popup.timer = setTimeout(function watchPopup() {
        if (!popup.win || popup.win.closed) {
          popup.deferred.reject({
            status: -5,
            statusText: 'popup closed'
          });
        } else  {
          popup.timer = setTimeout(watchPopup, watchInterval);
        }
      }, watchInterval);

      return promise;
    }

    return {
      init: function(options) {
        options = options || {};
        // Domain is required
        if (!options.domain) {
          return;
        } else {
          // Strip off 'http://' if the domain included it
          options.domain = options.domain.replace(/^https?:\/\//, '');
        }

        // Copy option(s) onto global settings
        settings.domain = options.domain;
        popup.origin = popupProperties.scheme + settings.domain;

        // Create the iframe proxy
        if (isOldIE) {
          // Replace old iframe if this has already been called for a different domain
          if (iframeProxy) {
            iframeProxy.parentNode.removeChild(iframeProxy);
          }
          // Defer just in case this was called inline, to avoid blocking
          setTimeout(function() {
            iframeProxy = document.createElement('iframe');
            iframeProxy.id = iframeName;
            iframeProxy.height = '0px';
            iframeProxy.width = '0px';
            iframeProxy.src = popup.origin + iframeProxyPath;
            document.body.appendChild(iframeProxy);
          }, 0);
        }
        initialized = true;
      },
      open: function(options) {
        var picker, promise, messageListener;

        // If an existing popup is open, reject its promise and close it before opening a new one
        closePopupWith({
          status: -6,
          statusText: 'popup reopened'
        });

        picker = new Deferred();
        promise = picker.promise();

        if (!window.postMessage) {
          picker.reject({
            status: -1,
            statusText: 'not supported'
          });
          return promise;
        } else if (!initialized) {
          picker.reject({
            status: -2,
            statusText: 'not initialized'
          });
          return promise;
        } else if (!settings.domain) {
          picker.reject({
            status: -3,
            statusText: 'missing domain'
          });
          return promise;
        }

        // Cross-origin message handler
        messageListener = function (e) {
          var message;
          // Security check: make sure message is coming from our popup
          if (e.origin === (popupProperties.scheme + settings.domain)) {
            message = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
            // Simple resolve/reject logic: above 0 is success, below zero is fail
            if (message.status > 0) {
              // Clean up by resolving the popup
              if (popup.deferred) {
                clearTimeout(popup.timer);
                popup.deferred.resolve();
              }
              picker.resolve(message);
            } else if (message.status < 0) {
              picker.reject(message);
            }
          }
        }

        // Receive messages from the iframe or popup
        window[eventMethodName](messageEventName, messageListener, false);

        // Unbind event-listener when we're done with the popup
        promise.always(function() {
          window[removeMethodName](messageEventName, messageListener, false);
        });

        // Open the popup
        launchPopup(options).fail(function(response) {
          picker.reject(response);
        });

        return promise;
      },
      close: function() {
        return closePopupWith({
          status: -5,
          statusText: 'popup closed'
        });
      }
    };
  })();

  // Called from popup window; passes data back to calling window (or iframe)
  SCLFilePicker._send = function(dataToSend, targetOrigin) {
    var message, openerFrame;
    // Quit now and return false if the opening window or the iframe proxy is gone
    if (!window.opener) {
      return false;
    } else if (isOldIE) {
      openerFrame = opener.frames[iframeName];
      // Quit if the iframe proxy has disappeared somehow
      if (!openerFrame) {
        return false;
      }
    }
    message = {
      status: 1,
      statusText: 'file selected',
      data: dataToSend
    };
    // Send data back to calling page, either via the iframe proxy or just postMessage
    targetOrigin = targetOrigin || '*';
    if (isOldIE) {
      // This is the trick I spent so many hours looking for!
      openerFrame.proxyToParent(JSON.stringify(message), targetOrigin);
    } else {
      opener.postMessage(message, targetOrigin);
    }
    // Close the popup since the data was sent successfully
    window.close();
    return true;
  };

})();