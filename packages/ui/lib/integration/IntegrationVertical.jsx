// import React, { useState } from 'react';
// import { redirect } from 'react-router-dom';
// // import { useSelector } from 'react-redux';
// // import { showModalForm } from './../actions/modalForm';
// // import { setIntegrations } from './../actions/integrations';
// import { CircleAlert } from 'lucide-react';
//
// import Api from './../api/api';
// import IntegrationDropdown from './IntegrationDropdown';
// import { Button } from '../base-components/button';
//
// function IntegrationVertical(props) {
//     // const authToken = useSelector((state) => state.auth.token);
//
//     const { name, description, category, icon } = props.data.display;
//     const { hasUserConfig, type } = props.data;
//
//     const [isProcessing, setIsProcessing] = useState(false);
//     const [status, setStatus] = useState('');
//     const [installed, setInstalled] = useState([]);
//
//     const api = new Api();
//     // api.setJwt(authToken);
//
//     const getAuthorizeRequirements = async () => {
//         setIsProcessing(true);
//         const authorizeData = await api.getAuthorizeRequirements(type, '');
//         if (authorizeData.type === 'oauth2') {
//             window.location.href = authorizeData.url;
//         }
//         if (authorizeData.type !== 'oauth2') enableModalForm();
//     };
//
//     const enableModalForm = () => {
//         const requestType = getRequestType();
//
//         // props.dispatch(
//         //     showModalForm(
//         //         true,
//         //         props.data.id,
//         //         requestType,
//         //         props.data.type,
//         //         props.data.config
//         //     )
//         // );
//     };
//
//     const getRequestType = () => {
//         let type;
//         switch (props.data.status) {
//             case 'NEEDS_CONFIG':
//                 type = 'INITIAL';
//                 break;
//             case 'ENABLED':
//                 type = 'CONFIGURE';
//                 break;
//             default:
//                 type = 'AUTHORIZE';
//         }
//         return type;
//     };
//
//     const getSampleData = async () => {
//         redirect(`/data/${props.data.id}`);
//     };
//
//     const disconnectIntegration = async () => {
//         console.log('Disconnect Clicked!');
//         await api.deleteIntegration(props.data.id);
//         const integrations = await api.listIntegrations();
//         if (!integrations.error) {
//             // props.dispatch(setIntegrations(integrations));
//         }
//         setInstalled([]);
//         setStatus('');
//     };
//
//     const authorizeMock = () => {
//         setIsProcessing(true);
//
//         setTimeout(() => {
//             setStatus('NEEDS_CONFIG');
//             setInstalled([props.data]);
//             props.handleInstall(props.data, props.status);
//             setIsProcessing(false);
//         }, 3000);
//     };
//
//     const disconnectMock = () => {
//         setInstalled([]);
//         setStatus('');
//     };
//
//     return (
//         <>
//             <div
//                 className="flex flex-col items-center p-4 bg-white rounded-lg shadow-xs"
//                 data-testid="integration-vertical"
//             >
//                 <div className="flex w-full h-[24px]">
//                     <div className="inline-flex relative mr-auto">
//                         {status && status === 'NEEDS_CONFIG' && (
//                             <p className="inline-flex text-xs font-medium text-red-300 text-center">
//                                 <CircleAlert className="w-4 h-4 mr-1" />{' '}
//                                 Configure
//                             </p>
//                         )}
//                     </div>
//                     <div className="inline-flex relative justify-end ml-auto">
//                         {(status && status === 'ENABLED') ||
//                             (status === 'NEEDS_CONFIG' && (
//                                 <IntegrationDropdown
//                                     getSampleData={getSampleData}
//                                     disconnectIntegration={
//                                         disconnectIntegration
//                                     }
//                                     name={name}
//                                     hasUserConfig={hasUserConfig}
//                                 />
//                             ))}
//                     </div>
//                 </div>
//                 <img
//                     className="w-[120px] h-[120px] rounded-full"
//                     alt={name}
//                     src={icon}
//                 />
//                 <div className="pr-1 pt-4 pb-4 overflow-hidden">
//                     <p className="w-full text-2xl font-semibold text-gray-700 text-center truncate ...">
//                         {name}
//                     </p>
//                     <p className="w-full pt-2 text-md font-medium text-gray-600 text-center">
//                         {description}
//                     </p>
//                 </div>
//                 <div className="items-center pb-3">
//                     <div className="relative">
//                         {(status && status === 'ENABLED') ||
//                             (status === 'NEEDS_CONFIG' && (
//                                 <button
//                                     onClick={disconnectIntegration}
//                                     className="w-full px-5 py-3 font-medium leading-5 text-center text-primary transition-colors duration-150 rounded-lg border-2 border-purple-400 hover:border-purple-600 hover:bg-purple-600 hover:text-white focus:outline-none focus:shadow-outline-purple"
//                                 >
//                                     Disconnect
//                                 </button>
//                             ))}
//                         {!status && (
//                             <Button
//                                 onClick={getAuthorizeRequirements}
//                                 className="w-full px-5 py-3 font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
//                             >
//                                 {isProcessing ? (
//                                     <svg
//                                         className="animate-spin h-5 w-5 text-white"
//                                         fill="none"
//                                         viewBox="0 0 24 24"
//                                     >
//                                         <circle
//                                             className="opacity-25"
//                                             cx="12"
//                                             cy="12"
//                                             r="10"
//                                             stroke="currentColor"
//                                             strokeWidth="4"
//                                         ></circle>
//                                         <path
//                                             className="opacity-75"
//                                             fill="currentColor"
//                                             d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
//                                         ></path>
//                                     </svg>
//                                 ) : (
//                                     'Connect'
//                                 )}
//                             </Button>
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </>
//     );
// }
//
// export default IntegrationVertical;
