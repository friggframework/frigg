// import React, { Component } from "react";
// import { connect } from "react-redux";
// import IntegrationHorizontal from "./IntegrationHorizontal";
// import IntegrationVertical from "./IntegrationVertical";
// import IntegrationSkeleton from "./IntegrationSkeleton.jsx";
// import { setIntegrations } from "./../actions/integrations";
// import IntegrationUtils from "../../utils/IntegrationUtils";
// import API from "../../api/api";
// import { logoutUser } from "../../actions/logout";
// import { setAuthToken } from "../../actions/auth";
// import config from "../../frigg.config";
//
// class IntegrationList extends Component {
//   constructor(props) {
//     super(props);
//
//     this.state = {
//       installedIntegrations: [],
//     };
//   }
//
//   async refreshIntegrations(props) {
//     const api = new API();
//
//     const jwt = sessionStorage.getItem("jwt");
//     api.setJwt(jwt);
//
//     const integrations = await api.listIntegrations();
//
//     if (integrations.error) this.props.dispatch(logoutUser());
//
//     await props.dispatch(setIntegrations(integrations));
//   }
//   async componentDidMount() {
//     const jwt = sessionStorage.getItem("jwt");
//     if (jwt !== this.props.authToken) {
//       await this.props.dispatch(setAuthToken(jwt));
//     }
//
//     if (this.props.authToken) {
//       await this.refreshIntegrations(this.props);
//     }
//   }
//
//   setInstalled = (data) => {
//     const items = [data, ...this.state.installedIntegrations];
//     console.log(data);
//     this.setState({ installedIntegrations: items });
//   };
//
//   // Temporary, refactor to higher order component pattern
//   // https://reactjs.org/docs/higher-order-components.html
//   integrationComponent = (integration) => {
//     if (config.componentLayout === "default-horizontal") {
//       return (
//         <IntegrationHorizontal
//           data={integration}
//           key={`combined-integration-${integration.type}`}
//           handleInstall={this.setInstalled}
//           refreshIntegrations={this.refreshIntegrations}
//         />
//       );
//     }
//     if (config.componentLayout === "default-vertical") {
//       return (
//         <IntegrationVertical
//           data={integration}
//           key={`combined-integration-${integration.type}`}
//           handleInstall={this.setInstalled}
//           refreshIntegrations={this.refreshIntegrations}
//         />
//       );
//     }
//   };
//
//   renderCombinedIntegrations = (combinedIntegrations) => {
//     if (this.props.integrationType == "Recently added") {
//       return combinedIntegrations.map((integration) =>
//         this.integrationComponent(integration),
//       );
//     }
//     if (this.props.integrationType == "Installed") {
//       console.log(this.state.installedIntegrations);
//       return this.state.installedIntegrations.map((integration) =>
//         this.integrationComponent(integration),
//       );
//     }
//     return combinedIntegrations
//       .filter(
//         (integration) =>
//           integration.display.description == this.props.integrationType,
//       )
//       .map((integration) => this.integrationComponent(integration));
//   };
//
//   render() {
//     let integrationUtils = null;
//     let displayedIntegrations = null;
//
//     if (this.props.integrations) {
//       integrationUtils = new IntegrationUtils(
//         this.props.integrations.integrations,
//       );
//       console.log(integrationUtils.getPrimaryType());
//       integrationUtils.getPossibleIntegrations();
//       console.log(
//         "integrationUtils.getPossibleIntegrations()",
//         integrationUtils.getPossibleIntegrations(),
//       );
//     }
//     if (integrationUtils) {
//       displayedIntegrations = this.renderCombinedIntegrations(
//         integrationUtils.getActiveAndPossibleIntegrationsCombined(),
//       );
//       console.log(
//         "getActiveAndPossibleIntegrationsCombined",
//         integrationUtils.getActiveAndPossibleIntegrationsCombined(),
//       );
//     }
//     console.log("displayedIntegrations", displayedIntegrations);
//     return (
//       <>
//         {integrationUtils !== null ? (
//           displayedIntegrations
//         ) : (
//           <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3">
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//             <IntegrationSkeleton layout={config.componentLayout} />
//           </div>
//         )}
//         {integrationUtils !== null && displayedIntegrations.length == 0 && (
//           <p>No {this.props.integrationType} integrations found.</p>
//         )}
//       </>
//     );
//   }
// }
//
// function mapStateToProps({ auth, integrations }) {
//   return {
//     authToken: auth.token,
//     integrations,
//   };
// }
//
// export default connect(mapStateToProps)(IntegrationList);
