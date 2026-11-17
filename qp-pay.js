/* Qal'a Posbonlari: Google Play Billing ko'prigi (Play Market ilovasi ichida ishlaydi).
   Faqat Play'dan o'rnatilgan TWA ilovada (Digital Goods API bor joyda) window.QPPay yaratiladi.
   Oddiy brauzerda QPPay bo'lmaydi va o'yin o'zining oddiy oynasini ko'rsatadi.

   O'yin bilan kelishuv:
     QPPay.buy(k)    -> Promise<boolean>; k = alp | tomaris | buxoro | samarqand | hammasi
     QPPay.prices    -> {alp:'$0.99', ...} Play'dan kelgan mahalliy narxlar (yuklangach)
     QPPay.ready     -> Promise, xaridlar tiklangach tugaydi
   Egalik: localStorage qp_own_<k> = '1'. "hammasi" (to'plam) to'rttasini ham ochadi.
   Har bir xarid serverda (Netlify funksiyasi qp-ack) tekshiriladi va tasdiqlanadi,
   aks holda Google 3 kundan keyin pulni qaytarib beradi. */
(function () {
  if (!('getDigitalGoodsService' in window) || !('PaymentRequest' in window)) return;
  var PLAY = 'https://play.google.com/billing';
  var ITEMS = ['alp', 'tomaris', 'buxoro', 'samarqand'];
  var BUNDLE = 'hammasi';
  var SKUS = ITEMS.concat([BUNDLE]);
  var ACK_URL = '/.netlify/functions/qp-ack';
  var svcP = null;

  function svc() {
    if (!svcP) svcP = window.getDigitalGoodsService(PLAY).catch(function (e) { svcP = null; throw e; });
    return svcP;
  }
  function own(sku) {
    var ks = sku === BUNDLE ? ITEMS : [sku];
    ks.forEach(function (k) { try { localStorage.setItem('qp_own_' + k, '1'); } catch (e) {} });
  }
  function ack(token, sku) {
    return fetch(ACK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, sku: sku })
    }).then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (j) { return !!(j && j.ok); })
      .catch(function () { return false; });
  }

  var QPPay = { prices: {}, available: true };

  QPPay.ready = svc().then(function (s) {
    s.getDetails(SKUS).then(function (list) {
      (list || []).forEach(function (d) {
        try {
          QPPay.prices[d.itemId] = new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(+d.price.value);
        } catch (e) { QPPay.prices[d.itemId] = d.price.value + ' ' + d.price.currency; }
      });
    }).catch(function () {});
    return s.listPurchases().then(function (ps) {
      (ps || []).forEach(function (p) {
        if (SKUS.indexOf(p.itemId) < 0) return;
        own(p.itemId);
        ack(p.purchaseToken, p.itemId); // tasdiqlanmagan bo'lsa, endi tasdiqlanadi
      });
    });
  }).catch(function () {});

  QPPay.buy = function (k) {
    if (SKUS.indexOf(k) < 0) return Promise.resolve(false);
    var req;
    try {
      req = new PaymentRequest(
        [{ supportedMethods: PLAY, data: { sku: k } }],
        { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }
      );
    } catch (e) { return Promise.resolve(false); }
    return req.show().then(function (resp) {
      var token = resp.details && resp.details.purchaseToken;
      if (!token) return resp.complete('fail').then(function () { return false; });
      return ack(token, k).then(function (ok) {
        if (ok) own(k);
        return resp.complete(ok ? 'success' : 'fail').then(function () { return ok; }, function () { return ok; });
      });
    }).catch(function () { return false; }); // bekor qilindi yoki xato
  };

  window.QPPay = QPPay;
})();
