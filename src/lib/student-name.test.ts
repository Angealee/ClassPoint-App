import { describe, expect, it } from 'vitest'
import { initialsOf, officialName, socialName } from './student-name'

describe('officialName', () => {
  it('last, first with middle initial', () => {
    expect(officialName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Andres' })).toBe(
      'Dela Cruz, Juan A.',
    )
  })

  it('last, first without middle', () => {
    expect(officialName({ lastName: 'Dela Cruz', firstName: 'Juan' })).toBe('Dela Cruz, Juan')
  })

  it('last, first middle suffix', () => {
    expect(
      officialName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Andres', suffix: 'Jr.' }),
    ).toBe('Dela Cruz, Juan A. Jr.')
  })

  it('suffix without middle', () => {
    expect(officialName({ lastName: 'Santos', firstName: 'Maria', suffix: 'III' })).toBe(
      'Santos, Maria III',
    )
  })

  it('trims whitespace on inputs', () => {
    expect(officialName({ lastName: ' Dela Cruz ', firstName: ' Juan ', middleName: ' Andres ' })).toBe(
      'Dela Cruz, Juan A.',
    )
  })

  it('null middle name treated as absent', () => {
    expect(officialName({ lastName: 'Reyes', firstName: 'Carlo', middleName: null })).toBe(
      'Reyes, Carlo',
    )
  })

  it('middle initial is always single letter + period', () => {
    expect(officialName({ lastName: 'Gomez', firstName: 'Luis', middleName: 'Enrique' })).toBe(
      'Gomez, Luis E.',
    )
  })
})

describe('socialName', () => {
  it('first last — no middle initial', () => {
    expect(socialName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Andres' })).toBe(
      'Juan Dela Cruz',
    )
  })

  it('first last with suffix', () => {
    expect(
      socialName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Andres', suffix: 'Jr.' }),
    ).toBe('Juan Dela Cruz Jr.')
  })

  it('no suffix, no middle', () => {
    expect(socialName({ lastName: 'Santos', firstName: 'Maria' })).toBe('Maria Santos')
  })
})

describe('initialsOf', () => {
  it('two words → two letters', () => {
    expect(initialsOf('Juan Dela Cruz')).toBe('JD')
  })

  it('single word → one letter', () => {
    expect(initialsOf('Madonna')).toBe('M')
  })

  it('exactly two words', () => {
    expect(initialsOf('Maria Santos')).toBe('MS')
  })

  it('trims and collapses spaces', () => {
    expect(initialsOf('  Juan   Dela Cruz  ')).toBe('JD')
  })
})
