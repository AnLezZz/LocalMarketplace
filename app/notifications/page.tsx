import NotificationList from "./NotificationList";
import "./notifications.css";
import AccountShell from "../../components/AccountShell";

export default function Notifications() {
  return (
    <AccountShell active="notifications"><div className="acct-pane">
      <h1 className="page__title">Notifications</h1>
      <p className="page__sub">Updates on your bookings and reviews, live.</p>
      <NotificationList />
    </div></AccountShell>
  );
}
