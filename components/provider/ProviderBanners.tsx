import Link from "next/link";
import Icon from "../Icon";

/** Application, suspension and rejection notices: shown at the top of the provider's overview. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ProviderBanners({ profile }: { profile: any }) {
  return (
    <>
      {profile.status === "pending" && (
        <div className="card d-banner d-banner--pending">
          <div className="d-banner__icon">
            <Icon name="clock" size={24} />
          </div>
          <div className="d-banner__content">
            <h2 className="d-banner__title">Application under review</h2>
            <p className="d-banner__text">
              Your profile is being reviewed by the Localo admin team. Once approved, you
              will appear in local search results and receive new customer bookings.
            </p>
          </div>
          <Link href="/provider/register" className="btn btn--secondary btn--sm">
            Edit application
          </Link>
        </div>
      )}

      {profile.status === "suspended" && (
        <div className="card d-banner d-banner--rejected">
          <div className="d-banner__icon"><Icon name="alert" size={24} /></div>
          <div className="d-banner__content">
            <h2 className="d-banner__title">Your listing is suspended</h2>
            <p className="d-banner__text">Customers can&apos;t find you or book you right now. <strong>Reason:</strong> {profile.suspendedReason}. Contact support to appeal.</p>
          </div>
        </div>
      )}

      {profile.status === "rejected" && (
        <div className="card d-banner d-banner--rejected">
          <div className="d-banner__icon">
            <Icon name="alert" size={24} />
          </div>
          <div className="d-banner__content">
            <h2 className="d-banner__title">Application needs changes</h2>
            <p className="d-banner__text">
              <strong>Review feedback:</strong> {profile.rejectionReason}
            </p>
          </div>
          <Link href="/provider/register" className="btn btn--primary btn--sm">
            Update and resubmit
          </Link>
        </div>
      )}
    </>
  );
}
