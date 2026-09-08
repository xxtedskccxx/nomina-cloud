'use client'

import { useState } from 'react'
import { employeeName, plural } from '@/lib/payroll-view'
import type { EmployeeSummary } from '@/lib/payslip-types'
import { CheckCircleIcon, UsersIcon } from '@/components/ui/icons'
import { EmptyState, StatusPill } from '@/components/ui/primitives'

const preview = 6

/*
Responde "¿todos tienen volante?" con nombres, no con un número. Un
código de empleado suelto no sirve para llamar por teléfono a quien
falta; el nombre y el área sí.
*/
export function MissingEmployeesPanel({
  employees,
  total,
  hasPeriod,
  expected,
}: {
  employees: EmployeeSummary[]
  total: number
  hasPeriod: boolean
  expected: number
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? employees : employees.slice(0, preview)

  return (
    <section className="panel" aria-labelledby="missing-title">
      <div className="panel-head">
        <h2 className="title-section" id="missing-title">
          Empleados sin volante
        </h2>
        {total > 0 ? <StatusPill tone="warn" label={String(total)} /> : null}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={hasPeriod && expected > 0 ? <CheckCircleIcon size={18} /> : <UsersIcon size={18} />}
          title={
            !hasPeriod
              ? 'Sin período seleccionado'
              : expected === 0
                ? 'El período no tiene empleados'
                : 'Nadie se queda sin volante'
          }
          description={
            !hasPeriod
              ? 'Elige un período para ver quién tiene volante y quién no.'
              : expected === 0
                ? 'Todavía no hay empleados asignados a este período de nómina.'
                : `Los ${expected} empleados del período tienen un volante cargado.`
          }
        />
      ) : (
        <>
          <div className="line-list scroll-region">
            {visible.map((employee) => (
              <div className="line-item" key={employee.id}>
                <div className="line-item-main">
                  <strong>{employeeName(employee)}</strong>
                  <p className="meta-tight">
                    {employee.employeeCode}
                    {employee.department ? ` · ${employee.department.name}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {employees.length > preview ? (
            <div className="panel-foot">
              <span className="meta-tight">
                {expanded
                  ? `${employees.length} ${plural(employees.length, 'empleado', 'empleados')} en la lista`
                  : `Mostrando ${preview} de ${total}`}
              </span>
              <button
                className="button button-quiet button-small"
                onClick={() => setExpanded((current) => !current)}
                type="button"
              >
                {expanded ? 'Mostrar menos' : `Ver los ${employees.length}`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
