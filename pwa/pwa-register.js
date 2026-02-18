document.addEventListener('DOMContentLoaded', () => {
	const applicationServerKey = 'BIbd36jgkvbo0pjo4BbrTYLE6_Pyzr_X5M1th0I1D6vDPKJCoLNQZv1nynzmE-dL63V76lztpsiSswES8s6GSZQ';
	
	if (!('serviceWorker' in navigator)) {
		console.warn('Service workers are not supported by this browser');
		return;
	}

	if (!('PushManager' in window)) {
		console.warn('Push notifications are not supported by this browser');
		return;
	}

	if (!('showNotification' in ServiceWorkerRegistration.prototype)) {
		console.warn('Notifications are not supported by this browser');
		return;
	}

	// Check the current Notification permission.
	// If its denied, the button should appears as such, until the user changes the permission manually
	if (Notification.permission === 'denied') {
		console.warn('Notifications are denied by the user');
		return;
	}

	navigator.serviceWorker.register('/sw.js').then(
		() => {
			console.log('[SW] Service worker has been registered');
			push_updateSubscription();
		},
		e => {
			console.error('[SW] Service worker registration failed', e);
		}
	);

	function urlBase64ToUint8Array(base64String) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	}

	function checkNotificationPermission() {
		return new Promise((resolve, reject) => {
			if (Notification.permission === 'denied') {
				return reject(new Error('Push messages are blocked.'));
			}

			if (Notification.permission === 'granted') {
				return resolve();
			}

			if (Notification.permission === 'default') {
				return Notification.requestPermission().then(result => {
					if (result !== 'granted') {
						reject(new Error('Bad permission result'));
					} else {
						resolve();
					}
				});
			}

			return reject(new Error('Unknown permission'));
		});
	}

	function push_subscribe() {
		return checkNotificationPermission()
			.then(() => navigator.serviceWorker.ready)
			.then(serviceWorkerRegistration =>
				serviceWorkerRegistration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
				})
			)
			.then(subscription => {
				// Subscription was successful
				// create subscription on your server
				return push_sendSubscriptionToServer(subscription, 'POST');
			})
			.catch(e => {
				if (Notification.permission === 'denied') {
					// The user denied the notification permission which
					// means we failed to subscribe and the user will need
					// to manually change the notification permission to
					// subscribe to push messages
					console.warn('Notifications are denied by the user.');
				} else {
					// A problem occurred with the subscription; common reasons
					// include network errors or the user skipped the permission
					console.error('Impossible to subscribe to push notifications', e);
				}
			});
	}

	function push_updateSubscription() {
		navigator.serviceWorker.ready
			.then(serviceWorkerRegistration => serviceWorkerRegistration.pushManager.getSubscription())
			.then(subscription => {
				if (!subscription) {
					// We aren't subscribed to push, so set UI to allow the user to enable push
					push_subscribe();
					return;
				}

				// Keep your server in sync with the latest endpoint
				return push_sendSubscriptionToServer(subscription, 'PUT');
			})
			.catch(e => {
				console.error('Error when updating the subscription', e);
			});
	}

	function push_unsubscribe() {
		// To unsubscribe from push messaging, you need to get the subscription object
		navigator.serviceWorker.ready
			.then(serviceWorkerRegistration => serviceWorkerRegistration.pushManager.getSubscription())
			.then(subscription => {
				// Check that we have a subscription to unsubscribe
				if (!subscription) {
					// No subscription object, so set the state
					// to allow the user to subscribe to push
					return;
				}

				// We have a subscription, unsubscribe
				// Remove push subscription from server
				return push_sendSubscriptionToServer(subscription, 'DELETE');
			})
			.then(subscription => subscription.unsubscribe())
			.catch(e => {
				// We failed to unsubscribe, this can lead to
				// an unusual state, so  it may be best to remove
				// the users data from your data store and
				// inform the user that you have done so
				console.error('Error when unsubscribing the user', e);
			});
	}

	function push_sendSubscriptionToServer(subscription, method) {
		const key = subscription.getKey('p256dh');
		const token = subscription.getKey('auth');
		const contentEncoding = (PushManager.supportedContentEncodings || ['aesgcm'])[0];
		const subscriptionEndPoint = '/site/push-notification';

		return $.ajax({
			url: subscriptionEndPoint,
			method: method,
			contentType: 'application/json',
			data: JSON.stringify({
				endpoint: subscription.endpoint,
				publicKey: key ? btoa(String.fromCharCode.apply(null, new Uint8Array(key))) : null,
				authToken: token ? btoa(String.fromCharCode.apply(null, new Uint8Array(token))) : null,
				contentEncoding: contentEncoding
			})
		}).then(function () {
			return subscription;
		}).catch(function (e) {
			console.error('Error registering the subscription to server', e);
		});
	}
});