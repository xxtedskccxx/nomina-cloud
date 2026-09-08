import { EmployeePayslipViewer } from '@/components/employee-payslip-portal'

export default async function EmployeePayslipViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EmployeePayslipViewer id={id} />
}
