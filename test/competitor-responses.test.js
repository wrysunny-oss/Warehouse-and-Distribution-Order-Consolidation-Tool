'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createProductResponseCollector } = require('../src/services/competitor-response-collector');

test('响应监听只读取当前商品原请求，不重放请求；按商品隔离并清理监听', async () => {
  const debuggerClient = new EventEmitter();
  const calls = [];
  debuggerClient.isAttached = () => false;
  debuggerClient.attach = () => {};
  debuggerClient.detach = () => calls.push('detach');
  debuggerClient.sendCommand = async (method, params) => {
    calls.push(method);
    if (method === 'Network.getResponseBody') return { body: 'callback({"ret":["SUCCESS::调用成功"],"data":{"item":{"itemId":"123"}}})', base64Encoded: false };
    return {};
  };
  const collector = createProductResponseCollector({ debugger: debuggerClient });
  const url = 'https://h5api.m.taobao.com/h5/mtop.taobao.pcdetail.data.get/1.0/?data=' + encodeURIComponent(JSON.stringify({ id: '123' }));
  debuggerClient.emit('message', {}, 'Network.requestWillBeSent', { requestId: 'one', request: { url } });
  debuggerClient.emit('message', {}, 'Network.responseReceived', { requestId: 'one', response: { url } });
  debuggerClient.emit('message', {}, 'Network.loadingFinished', { requestId: 'one', encodedDataLength: 120 });
  await collector.flush();
  assert.equal(collector.forItem('123').length, 1);
  assert.equal(collector.forItem('456').length, 0);
  assert.equal(collector.forItem('123')[0].data.item.itemId, '123');
  assert.ok(!calls.some(call => /replay|RequestPostData|Cookie/.test(call)));
  collector.close();
  assert.equal(debuggerClient.listenerCount('message'), 0);
  assert.equal(collector.forItem('123').length, 0);
});

test('原有调试会话被占用时不抢占，也不在关闭时断开别人的会话', () => {
  const debuggerClient = { isAttached: () => true, attach: () => assert.fail('must not attach'), detach: () => assert.fail('must not detach') };
  const collector = createProductResponseCollector({ debugger: debuggerClient });
  assert.equal(collector.status.available, false);
  assert.match(collector.status.error, /占用/);
  collector.close();
});

test('真实全部评价请求使用auctionNumId；分页响应分别保留，不被后一页覆盖', async () => {
  const client = new EventEmitter();
  client.isAttached = () => false; client.attach = () => {}; client.detach = () => {};
  client.sendCommand = async method => method === 'Network.getResponseBody' ? { body: JSON.stringify({ ret: ['SUCCESS::调用成功'], data: { rateList: [] } }) } : {};
  const collector = createProductResponseCollector({ debugger: client });
  for (const pageNo of [1, 2]) {
    const url = 'https://h5api.m.tmall.com/h5/mtop.taobao.rate.detaillist.get/6.0/?data=' + encodeURIComponent(JSON.stringify({ auctionNumId: '123', pageNo, rateType: '-8', foldFlag: '0' }));
    client.emit('message', {}, 'Network.requestWillBeSent', { requestId: String(pageNo), request: { url } });
    client.emit('message', {}, 'Network.responseReceived', { requestId: String(pageNo), response: { url } });
    client.emit('message', {}, 'Network.loadingFinished', { requestId: String(pageNo), encodedDataLength: 50 });
  }
  await collector.flush();
  assert.deepEqual(collector.forItem('123').map(r => r.page), [1, 2]);
  assert.ok(collector.forItem('123').every(r => r.reviewAll));
  collector.close();
});
