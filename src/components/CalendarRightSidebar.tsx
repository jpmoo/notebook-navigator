import { NavigationPaneCalendar } from './NavigationPaneCalendar';

export function CalendarRightSidebar() {
    return (
        <div className="nn-calendar-right-sidebar nn-list-pane">
            <div className="nn-calendar-right-sidebar-content">
                <NavigationPaneCalendar layout="panel" weeksToShowOverride={6} />
            </div>
        </div>
    );
}
