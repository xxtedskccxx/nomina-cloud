import { EmployeeProfile } from '@/components/employee/employee-profile'
import { BottomTabBar } from '@/components/employee/bottom-tab-bar'
import { PortalHeader } from '@/components/portal-header'

export default function EmployeeProfilePage() {
  return (
    <>
      <PortalHeader role="EMPLOYEE" />
      <main className="page page-narrow employee-layout" aria-labelledby="profile-page-title">
        <div className="page-title-row">
          <h1 className="title-page" id="profile-page-title">Mi perfil</h1>
          <p className="meta">Tus datos laborales y de contacto.</p>
        </div>
        <EmployeeProfile />
      </main>
      <BottomTabBar />
    </>
  )
}
