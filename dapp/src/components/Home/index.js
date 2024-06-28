import React, { useState } from 'react'

import {
  HomeContainer
} from './styles'

import { SideBar } from '../SideBar'
import { RightPane } from '../RightPane'
import { useWindowSize } from '../../hooks/useWindowSize'
import StarryGalaxy from './StarryGalaxy'
import BackgroundPng from '../../assets/images/background.jpg';

export const Home = (props) => {
  const w = useWindowSize()

  const [sideBarVisible, setSideBarVisible] = useState(false);

  const handleSideBarShow = () => {
    if (w.width < 864) {
      setSideBarVisible(t => !t);
    }
  }

  return (
    <HomeContainer>
      <img src={BackgroundPng} style={{position: 'fixed', opacity: '0.2', width: '100%', height: '100%', left: 0, top: 0}} />
      {/* <StarryGalaxy /> */}
      <SideBar visible={sideBarVisible} close={() => setSideBarVisible(false)}/>
      <RightPane handleSideBarShow={handleSideBarShow}/>
    </HomeContainer>
  )
}
