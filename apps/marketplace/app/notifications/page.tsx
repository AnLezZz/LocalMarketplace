import NotificationList from "./NotificationList";
import "./notifications.css";

export default function Notifications() {
  return (
    <div className="page page--narrow">
      <h1 className="page__title">Notifications</h1>
      <p className="page__sub">Updates on your bookings and reviews, live.</p>
      <NotificationList />
    </div>
  );
}
