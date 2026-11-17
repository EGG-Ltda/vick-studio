const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  isBookingOriginAllowed: allowed,
} = require('../dist/modules/booking/origin')
test('booking accepts the Vite loopback proxy only in development', () => {
  assert.equal(
    allowed('http://localhost:5173', 'localhost:3000', 'http', 'development'),
    true,
  )
  assert.equal(
    allowed('http://127.0.0.1:5173', 'localhost:3000', 'http', 'development'),
    true,
  )
  assert.equal(
    allowed('http://localhost:5173', 'localhost:3000', 'http', 'production'),
    false,
  )
  assert.equal(
    allowed('http://localhost:5173', 'salon.example', 'https', 'development'),
    false,
  )
  assert.equal(
    allowed(
      'http://evil.example:5173',
      'localhost:3000',
      'http',
      'development',
    ),
    false,
  )
  assert.equal(
    allowed(
      'http://localhost.evil.example:5173',
      'localhost:3000',
      'http',
      'development',
    ),
    false,
  )
})
test('booking keeps explicit production origin, protocol and malformed-origin checks', () => {
  assert.equal(
    allowed('https://salon.example', 'salon.example', 'https', 'production'),
    true,
  )
  assert.equal(
    allowed('http://salon.example', 'salon.example', 'https', 'production'),
    false,
  )
  assert.equal(
    allowed(
      'https://salon.example',
      'internal:3000',
      'http',
      'production',
      'https://salon.example',
    ),
    true,
  )
  assert.equal(
    allowed(
      'https://evil.example',
      'internal:3000',
      'http',
      'production',
      'https://salon.example',
    ),
    false,
  )
  assert.equal(allowed('null', 'localhost:3000', 'http', 'development'), false)
  assert.equal(
    allowed('not a URL', 'localhost:3000', 'http', 'development'),
    false,
  )
})
