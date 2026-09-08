import { describe, expect, it } from '@jest/globals'
import { matchEmployeeFromFileName } from './matching.js'

const employees = [
  { id: 'employee-1', employeeCode: 'EMP-00001', firstName: 'Ana', lastName: 'Santos' },
  { id: 'employee-2', employeeCode: 'EMP-00002', firstName: 'Luis', lastName: 'Mora' },
]

describe('matchEmployeeFromFileName', () => {
  it('matches an employee code exactly when it is delimited in the filename', () => {
    expect(matchEmployeeFromFileName('EMP-00001.pdf', employees)).toMatchObject({
      employee: employees[0],
      method: 'EXACT',
    })
  })

  it('matches common normalized filenames without guessing by employee name', () => {
    expect(matchEmployeeFromFileName('Volante_EMP00002_2026-09-15.pdf', employees)).toMatchObject({
      employee: employees[1],
      method: 'NORMALIZED',
    })
  })

  it('leaves unknown codes unresolved', () => {
    expect(matchEmployeeFromFileName('Juan_Perez.pdf', employees)).toMatchObject({
      employee: null,
      method: 'UNMATCHED',
    })
  })

  it('does not auto-match a normalized code when it is ambiguous', () => {
    const ambiguousEmployees = [
      ...employees,
      { id: 'employee-3', employeeCode: 'EMP00002', firstName: 'Marta', lastName: 'Mora' },
    ]

    expect(matchEmployeeFromFileName('Volante_EMP00002.pdf', ambiguousEmployees)).toMatchObject({
      employee: null,
      method: 'UNMATCHED',
      reviewReason: 'Employee code is ambiguous',
    })
  })
})
