import React from 'react';

export default function withRouter(Child) {
	return (props) => {
		const location = useLocation();
		const navigate = useNavigate();
		return <Child {...props} navigate={navigate} location={location} />;
	};
}
