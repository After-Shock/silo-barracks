import { Link } from "react-router-dom";

function LibraryStatComponent(props) {
  if (props.data.length === 0) {
    return <></>;
  }

  const cardStyle = {
    backgroundImage: `url(${props.base_url}/Items/${props.data[0].Id}/Images/Backdrop/?fillWidth=300&quality=10)`,
    height: "100%",
    backgroundSize: "cover",
  };

  const cardBgStyle = {
    // backdropFilter: 'blur(5px)',
    backgroundColor: "var(--barracks-scrim)",
    height: "100%",
  };

  return (
    <div className="stat-card rounded-3" style={cardStyle}>
      <div style={cardBgStyle} className="rounded-3">
        <div className="stat-card-row">
          <div className="stat-card-banner">
            <div className="stat-card-icon">{props.icon}</div>
          </div>

          <div className="stat-card-main w-100">
            <div className="w-100">
              <div className="d-flex justify-content-between border-0 p-0 bg-transparent stat-header">
                <div>
                  <div className="stat-items">{props.heading}</div>
                </div>
                <div>
                  <div className="stat-items fw-lighter text-end">{props.units}</div>
                </div>
              </div>
              {props.data &&
                props.data.slice(0, 5).map((item, index) => (
                  <div className="d-flex justify-content-between  stat-items" key={item.Id || index}>
                    <div className="d-flex justify-content-between">
                      <div className="stat-item-index m-0">{index + 1}</div>
                      <Link to={`/libraries/${item.Id}`}>
                        <div>{item.Name}</div>
                      </Link>
                    </div>

                    <div className="stat-item-count">
                      {item.CollectionType === "tvshows"
                        ? item.Library_Count + " / " + item.Season_Count + " / " + item.Episode_Count
                        : item.Library_Count}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LibraryStatComponent;
