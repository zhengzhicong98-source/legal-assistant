const pages = [
  'pages/home/index',
  'pages/consult/index',
  'pages/contract/index',
  'pages/tools/index',
  'pages/plaza/index',
  'pages/plaza/post',
  'pages/plaza/detail',
  'pages/document/index',
  'pages/calculator/index',
  'pages/rights/index',
  'pages/evidence/index',
  'pages/admin/index',
  'pages/admin/stats',
  'pages/login/index',
  'pages/profile/index',
  'pages/profile/history',
  'pages/profile/saved',
  'pages/knowledge/index',
  'pages/notifications/index',
  'pages/laws/index',
  'pages/lawyers/index',
  'pages/rights/track',
]

export default defineAppConfig({
  pages,
  tabBar: {
    color: '#6B7280',
    selectedColor: '#1A5C54',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: './assets/icons/home_unselected.png',
        selectedIconPath: './assets/icons/home_selected.png',
      },
      {
        pagePath: 'pages/consult/index',
        text: '法律咨询',
        iconPath: './assets/icons/chat_unselected.png',
        selectedIconPath: './assets/icons/chat_selected.png',
      },
      {
        pagePath: 'pages/contract/index',
        text: '合同审查',
        iconPath: './assets/icons/contract_unselected.png',
        selectedIconPath: './assets/icons/contract_selected.png',
      },
      {
        pagePath: 'pages/plaza/index',
        text: '广场',
        iconPath: './assets/icons/plaza_unselected.png',
        selectedIconPath: './assets/icons/plaza_selected.png',
      },
      {
        pagePath: 'pages/tools/index',
        text: '工具箱',
        iconPath: './assets/icons/tools_unselected.png',
        selectedIconPath: './assets/icons/tools_selected.png',
      },
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1A5C54',
    navigationBarTitleText: '法律助手',
    navigationBarTextStyle: 'white'
  },
  permission: {
    'scope.userFuzzyLocation': {
      desc: '用于搜索您附近的维权机构（劳动仲裁委、消协、法律援助中心）'
    }
  },
  requiredPrivateInfos: ['getFuzzyLocation'],
  })
